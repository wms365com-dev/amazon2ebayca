import crypto from "crypto";

import { ApiLogSource, Marketplace } from "@prisma/client";

import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AmazonCatalogCandidate, NormalizedMarketplaceListing } from "../../types/domain";
import { readCache, writeCache } from "../../utils/cache";
import { requestWithRetry } from "../../utils/http";
import { createApiLog } from "../apiLogService";
import { loadDemoAmazonCatalog, loadDemoAmazonFees, loadDemoAmazonPricing } from "../demo/fixtureService";
import { getAppSettings } from "../settingsService";

type IdentifierType = "UPC" | "EAN";

interface RequestContext {
  scanJobId?: number;
  savedSearchId?: number;
}

interface PricingResult {
  amazonPrice: number | null;
  featuredOfferPrice: number | null;
  rawPricingJson?: unknown;
}

interface FeeResult {
  feeEstimate: number | null;
  fulfillmentFee: number | null;
  referralFee: number | null;
  rawFeesJson?: unknown;
}

export class AmazonService {
  private lwaToken: { token: string; expiresAt: number } | null = null;
  private readonly baseUrl = "https://sellingpartnerapi-na.amazon.com";
  private readonly serviceName = "execute-api";

  async getCatalogItemByAsin(
    asin: string,
    marketplaceId: string,
    context: RequestContext = {}
  ): Promise<AmazonCatalogCandidate | null> {
    const settings = await getAppSettings();
    const explicitDemoMode = settings.demoModeOverride || env.demoModeRequested;
    if (explicitDemoMode) {
      const catalog = await loadDemoAmazonCatalog();
      return catalog.find((candidate) => candidate.asin === asin) ?? null;
    }
    this.assertCredentials();

    const cacheKey = `amazon:catalog:asin:${asin}:${marketplaceId}`;
    const cached = await readCache<AmazonCatalogCandidate | null>(cacheKey, 15 * 60_000);
    if (cached) {
      return cached;
    }

    const response = await this.signedRequest<Record<string, unknown>>({
      method: "GET",
      path: `/catalog/2022-04-01/items/${encodeURIComponent(asin)}`,
      query: {
        marketplaceIds: marketplaceId,
        includedData: "summaries,attributes,images,identifiers"
      }
    });

    if (response.status >= 400) {
      await this.logFailure("getCatalogItemByAsin", asin, response.status, response.data, context);
      throw new Error(`Amazon catalog ASIN lookup failed with status ${response.status}`);
    }

    const mapped = this.mapCatalogItem(response.data);
    await writeCache(cacheKey, mapped);
    await createApiLog({
      source: ApiLogSource.AMAZON,
      operation: "getCatalogItemByAsin",
      requestKey: asin,
      statusCode: response.status,
      detail: { title: mapped.title },
      scanJobId: context.scanJobId,
      savedSearchId: context.savedSearchId
    });

    return mapped;
  }

  async searchSourceListings(
    keywords: string,
    marketplaceId: string,
    limit = 10,
    context: RequestContext = {}
  ): Promise<NormalizedMarketplaceListing[]> {
    const catalog = await this.searchCatalogByKeywords(keywords, marketplaceId, context);
    const limited = catalog.slice(0, limit);
    const listings: NormalizedMarketplaceListing[] = [];

    for (const candidate of limited) {
      const pricing = await this.getPricingForAsin(candidate.asin, marketplaceId, context);
      const sellPrice = pricing.featuredOfferPrice ?? pricing.amazonPrice ?? candidate.featuredOfferPrice ?? candidate.amazonPrice;
      if (!sellPrice) {
        continue;
      }

      listings.push({
        marketplace: Marketplace.AMAZON_CA,
        externalListingId: candidate.asin,
        listingKind: "CATALOG",
        title: candidate.title,
        subtitle: null,
        condition: "NEW",
        buyingOptions: ["CATALOG"],
        currentPrice: sellPrice,
        shippingCost: 0,
        listingUrl: `https://www.amazon.ca/dp/${candidate.asin}`,
        imageUrl: candidate.imageUrl ?? null,
        sellerName: null,
        sellerFeedbackPercentage: null,
        sellerFeedbackScore: null,
        gtin: candidate.identifiers?.[0] ?? null,
        brand: candidate.brand ?? null,
        mpn: candidate.model ?? null,
        upc: candidate.identifiers?.[0] ?? null,
        categoryPath: null,
        locationCountry: "CA",
        quantityAvailable: null,
        packageQuantity: candidate.packageQuantity ?? null,
        variant: candidate.sizeColorVariant ?? null,
        listingEndAt: null,
        rawJson: {
          catalog: candidate.rawCatalogJson,
          pricing: pricing.rawPricingJson
        }
      });
    }

    return listings;
  }

  async searchCatalogByIdentifier(
    identifier: string,
    identifierType: IdentifierType,
    marketplaceId: string,
    context: RequestContext = {}
  ): Promise<AmazonCatalogCandidate[]> {
    const settings = await getAppSettings();
    const explicitDemoMode = settings.demoModeOverride || env.demoModeRequested;
    if (explicitDemoMode) {
      return this.searchDemoCatalog((candidate) => candidate.identifiers?.includes(identifier) ?? false);
    }
    this.assertCredentials();

    const cacheKey = `amazon:catalog:identifier:${identifierType}:${identifier}:${marketplaceId}`;
    const cached = await readCache<AmazonCatalogCandidate[]>(cacheKey, 15 * 60_000);
    if (cached) {
      await createApiLog({
        source: ApiLogSource.AMAZON,
        operation: "searchCatalogByIdentifier",
        requestKey: identifier,
        cacheHit: true,
        message: "Served from database cache",
        detail: { count: cached.length },
        scanJobId: context.scanJobId,
        savedSearchId: context.savedSearchId
      });
      return cached;
    }

    const response = await this.signedRequest<{
      items?: Array<Record<string, unknown>>;
    }>({
      method: "GET",
      path: "/catalog/2022-04-01/items",
      query: {
        marketplaceIds: marketplaceId,
        identifiers: identifier,
        identifiersType: identifierType,
        includedData: "summaries,attributes,images,identifiers"
      }
    });

    if (response.status >= 400) {
      await this.logFailure("searchCatalogByIdentifier", identifier, response.status, response.data, context);
      throw new Error(`Amazon catalog identifier lookup failed with status ${response.status}`);
    }

    const mapped = (response.data.items ?? []).map((item) => this.mapCatalogItem(item));
    await writeCache(cacheKey, mapped);
    await createApiLog({
      source: ApiLogSource.AMAZON,
      operation: "searchCatalogByIdentifier",
      requestKey: identifier,
      statusCode: response.status,
      detail: { count: mapped.length },
      scanJobId: context.scanJobId,
      savedSearchId: context.savedSearchId
    });

    return mapped;
  }

  async searchCatalogByKeywords(
    keywords: string,
    marketplaceId: string,
    context: RequestContext = {}
  ): Promise<AmazonCatalogCandidate[]> {
    const settings = await getAppSettings();
    const explicitDemoMode = settings.demoModeOverride || env.demoModeRequested;
    if (explicitDemoMode) {
      return this.searchDemoCatalog((candidate) =>
        candidate.title.toLowerCase().includes((keywords.toLowerCase().split(" ")[0] ?? "").trim())
      );
    }
    this.assertCredentials();

    const cacheKey = `amazon:catalog:keywords:${keywords}:${marketplaceId}`;
    const cached = await readCache<AmazonCatalogCandidate[]>(cacheKey, 15 * 60_000);
    if (cached) {
      await createApiLog({
        source: ApiLogSource.AMAZON,
        operation: "searchCatalogByKeywords",
        requestKey: keywords,
        cacheHit: true,
        message: "Served from database cache",
        detail: { count: cached.length },
        scanJobId: context.scanJobId,
        savedSearchId: context.savedSearchId
      });
      return cached;
    }

    const response = await this.signedRequest<{
      items?: Array<Record<string, unknown>>;
    }>({
      method: "GET",
      path: "/catalog/2022-04-01/items",
      query: {
        marketplaceIds: marketplaceId,
        keywords,
        includedData: "summaries,attributes,images,identifiers"
      }
    });

    if (response.status >= 400) {
      await this.logFailure("searchCatalogByKeywords", keywords, response.status, response.data, context);
      throw new Error(`Amazon catalog keyword lookup failed with status ${response.status}`);
    }

    const mapped = (response.data.items ?? []).map((item) => this.mapCatalogItem(item));
    await writeCache(cacheKey, mapped);
    await createApiLog({
      source: ApiLogSource.AMAZON,
      operation: "searchCatalogByKeywords",
      requestKey: keywords,
      statusCode: response.status,
      detail: { count: mapped.length },
      scanJobId: context.scanJobId,
      savedSearchId: context.savedSearchId
    });

    return mapped;
  }

  async getPricingForAsin(asin: string, marketplaceId: string, context: RequestContext = {}): Promise<PricingResult> {
    const settings = await getAppSettings();
    const explicitDemoMode = settings.demoModeOverride || env.demoModeRequested;
    if (explicitDemoMode) {
      const pricingMap = await loadDemoAmazonPricing();
      return pricingMap[asin] ?? { amazonPrice: null, featuredOfferPrice: null };
    }
    this.assertCredentials();

    const cacheKey = `amazon:pricing:${asin}:${marketplaceId}`;
    const cached = await readCache<PricingResult>(cacheKey, 10 * 60_000);
    if (cached) {
      return cached;
    }

    const response = await this.signedRequest<Record<string, unknown>>({
      method: "GET",
      path: "/products/pricing/v0/price",
      query: {
        MarketplaceId: marketplaceId,
        Asins: asin,
        ItemType: "Asin"
      }
    });

    if (response.status >= 400) {
      await this.logFailure("getPricingForAsin", asin, response.status, response.data, context);
      throw new Error(`Amazon pricing request failed with status ${response.status}`);
    }

    const payload = this.mapPricingPayload(response.data);
    await writeCache(cacheKey, payload);
    return payload;
  }

  async getFeeEstimateForAsin(
    asin: string,
    price: number,
    marketplaceId: string,
    context: RequestContext = {}
  ): Promise<FeeResult> {
    const settings = await getAppSettings();
    const explicitDemoMode = settings.demoModeOverride || env.demoModeRequested;
    if (explicitDemoMode) {
      const feeMap = await loadDemoAmazonFees();
      return feeMap[asin] ?? { feeEstimate: null, fulfillmentFee: null, referralFee: null };
    }
    this.assertCredentials();

    const cacheKey = `amazon:fees:${asin}:${marketplaceId}:${price}`;
    const cached = await readCache<FeeResult>(cacheKey, 10 * 60_000);
    if (cached) {
      return cached;
    }

    const body = {
      FeesEstimateRequest: {
        MarketplaceId: marketplaceId,
        IsAmazonFulfilled: true,
        Identifier: asin,
        PriceToEstimateFees: {
          ListingPrice: {
            CurrencyCode: "CAD",
            Amount: price
          }
        }
      }
    };

    const response = await this.signedRequest<Record<string, unknown>>({
      method: "POST",
      path: `/products/fees/v0/items/${encodeURIComponent(asin)}/feesEstimate`,
      body
    });

    if (response.status >= 400) {
      await this.logFailure("getFeeEstimateForAsin", asin, response.status, response.data, context);
      throw new Error(`Amazon fee estimate request failed with status ${response.status}`);
    }

    const payload = this.mapFeePayload(response.data);
    await writeCache(cacheKey, payload);
    return payload;
  }

  private assertCredentials() {
    if (!env.hasAmazonCredentials) {
      throw new Error("Amazon credentials are missing. Configure SP-API credentials or enable demo mode explicitly.");
    }
  }

  private async getLwaToken() {
    if (this.lwaToken && this.lwaToken.expiresAt > Date.now() + 60_000) {
      return this.lwaToken.token;
    }

    const response = await requestWithRetry<{ access_token: string; expires_in: number }, URLSearchParams>({
      request: {
        method: "POST",
        url: "https://api.amazon.com/auth/o2/token",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        data: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: env.AMAZON_SPAPI_REFRESH_TOKEN ?? "",
          client_id: env.AMAZON_SPAPI_CLIENT_ID ?? "",
          client_secret: env.AMAZON_SPAPI_CLIENT_SECRET ?? ""
        })
      }
    });

    if (response.status >= 400 || !response.data.access_token) {
      throw new Error(`Amazon LWA token request failed with status ${response.status}`);
    }

    this.lwaToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000
    };

    return this.lwaToken.token;
  }

  private async signedRequest<TResponse>({
    method,
    path,
    query,
    body
  }: {
    method: "GET" | "POST";
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  }) {
    const accessToken = await this.getLwaToken();
    const host = "sellingpartnerapi-na.amazon.com";
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const region = env.AMAZON_SPAPI_AWS_REGION;
    const queryEntries = Object.entries(query ?? {}).filter(([, value]) => value !== undefined);
    const canonicalQuery = queryEntries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    const payload = body ? JSON.stringify(body) : "";
    const payloadHash = crypto.createHash("sha256").update(payload).digest("hex");
    const canonicalHeaders = `host:${host}\nx-amz-access-token:${accessToken}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-access-token;x-amz-date";
    const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${region}/${this.serviceName}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex")
    ].join("\n");
    const signingKey = this.getSignatureKey(
      env.AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY ?? "",
      dateStamp,
      region,
      this.serviceName
    );
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${env.AMAZON_SPAPI_AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return requestWithRetry<TResponse, unknown>({
      request: {
        method,
        url: `${this.baseUrl}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
        headers: {
          host,
          "x-amz-access-token": accessToken,
          "x-amz-date": amzDate,
          Authorization: authorization,
          "content-type": "application/json",
          "user-agent": "ebay-canada-to-amazon-ca-arbitrage/2.0"
        },
        data: body
      },
      onRetry: (attempt, error) => {
        logger.warn({ attempt, error }, "Retrying Amazon SP-API request");
      }
    });
  }

  private getSignatureKey(secret: string, dateStamp: string, regionName: string, serviceName: string) {
    const kDate = crypto.createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(regionName).digest();
    const kService = crypto.createHmac("sha256", kRegion).update(serviceName).digest();
    return crypto.createHmac("sha256", kService).update("aws4_request").digest();
  }

  private mapCatalogItem(item: Record<string, unknown>): AmazonCatalogCandidate {
    const itemAny = item as Record<string, any>;
    const summary = itemAny.summaries?.[0] ?? {};
    const attributes = itemAny.attributes ?? {};
    const rawIdentifiers = itemAny.identifiers?.[0]?.identifiers ?? [];
    const identifiers = rawIdentifiers
      .map((entry: { identifier?: string }) => String(entry.identifier ?? "").trim())
      .filter(Boolean);

    return {
      asin: String(item.asin ?? ""),
      title: String(summary.itemName ?? summary.itemClassification ?? "Unknown Amazon item"),
      brand: String(summary.brandName ?? "") || null,
      model: String(attributes.model_name?.[0]?.value ?? attributes.model_name ?? "") || null,
      packageQuantity: Number(summary.packageQuantity ?? 0) || null,
      sizeColorVariant:
        [summary.sizeName, summary.colorName].filter(Boolean).map((value) => String(value)).join(" / ") || null,
      imageUrl: itemAny.images?.[0]?.images?.[0]?.link ?? null,
      identifiers,
      rawCatalogJson: item
    };
  }

  private mapPricingPayload(payload: Record<string, unknown>): PricingResult {
    const payloadAny = payload as Record<string, any>;
    const priceNode = payloadAny.payload?.[0]?.Product?.Offers?.[0]?.BuyingPrice;
    const listingAmount = Number(priceNode?.ListingPrice?.Amount ?? 0);
    const landedAmount = Number(priceNode?.LandedPrice?.Amount ?? listingAmount);

    return {
      amazonPrice: listingAmount || null,
      featuredOfferPrice: landedAmount || listingAmount || null,
      rawPricingJson: payload
    };
  }

  private mapFeePayload(payload: Record<string, unknown>): FeeResult {
    const feeEstimateRoot = (payload as Record<string, any>).payload;
    const feeDetails = (feeEstimateRoot?.FeesEstimateResult?.FeesEstimate?.FeeDetailList ?? []) as Array<{
      FeeType?: string;
      FinalFee?: { Amount?: number };
    }>;
    const fulfillmentFee =
      feeDetails.find((item) => String(item.FeeType).includes("Fulfillment"))?.FinalFee?.Amount ?? null;
    const referralFee =
      feeDetails.find((item) => String(item.FeeType).includes("Referral"))?.FinalFee?.Amount ?? null;
    const feeEstimate = feeEstimateRoot?.FeesEstimateResult?.FeesEstimate?.TotalFeesEstimate?.Amount ?? null;

    return {
      feeEstimate: feeEstimate ? Number(feeEstimate) : null,
      fulfillmentFee: fulfillmentFee ? Number(fulfillmentFee) : null,
      referralFee: referralFee ? Number(referralFee) : null,
      rawFeesJson: payload
    };
  }

  private async searchDemoCatalog(filter: (candidate: AmazonCatalogCandidate) => boolean) {
    const catalog = await loadDemoAmazonCatalog();
    return catalog.filter(filter);
  }

  private async logFailure(
    operation: string,
    requestKey: string,
    statusCode: number,
    detail: unknown,
    context: RequestContext
  ) {
    await createApiLog({
      source: ApiLogSource.AMAZON,
      operation,
      requestKey,
      statusCode,
      isSuccess: false,
      isThrottled: statusCode === 429,
      message: "Amazon request failed",
      detail: detail as Record<string, unknown>,
      scanJobId: context.scanJobId,
      savedSearchId: context.savedSearchId
    });
  }
}
