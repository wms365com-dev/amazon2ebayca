import crypto from "crypto";

import { ApiLogSource } from "@prisma/client";

import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { createApiLog } from "../apiLogService";
import { loadDemoEbayListings } from "../demo/fixtureService";
import { getAppSettings } from "../settingsService";
import { readCache, writeCache } from "../../utils/cache";
import { requestWithRetry } from "../../utils/http";
import { NormalizedEbayListing } from "../../types/domain";
import { sanitizeText } from "../../utils/forms";

interface SearchListingsParams {
  keywords: string;
  categoryId?: string | null;
  includeBrands?: string[];
  excludeBrands?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  conditionFilter?: string | null;
  buyItNowOnly?: boolean;
  allowAuctions?: boolean;
  maxShipping?: number | null;
  limit?: number;
  page?: number;
}

interface SearchContext {
  scanJobId?: number;
  savedSearchId?: number;
  bypassCache?: boolean;
}

export class EbayService {
  private accessToken: { token: string; expiresAt: number } | null = null;

  private get baseUrl() {
    return env.EBAY_ENVIRONMENT === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.token;
    }

    const credentials = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64");
    const response = await requestWithRetry<{ access_token: string; expires_in: number }, string>({
      request: {
        method: "POST",
        url: `${this.baseUrl}/identity/v1/oauth2/token`,
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        data:
          "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope%20https://api.ebay.com/oauth/api_scope/buy.item.feed%20https://api.ebay.com/oauth/api_scope/buy.browse"
      }
    });

    if (response.status >= 400 || !response.data.access_token) {
      throw new Error(`eBay token request failed with status ${response.status}`);
    }

    this.accessToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000
    };

    return this.accessToken.token;
  }

  async searchListings(params: SearchListingsParams, context: SearchContext = {}): Promise<NormalizedEbayListing[]> {
    const settings = await getAppSettings();
    const safeMode = settings.rateLimitSafeMode;
    const limit = Math.min(params.limit ?? (safeMode ? 10 : 25), safeMode ? 10 : 25);

    if (!env.hasEbayCredentials || settings.demoModeOverride || env.demoModeRequested) {
      const demoListings = await loadDemoEbayListings();
      const filtered = this.filterListings(demoListings, params).slice(0, limit);

      await createApiLog({
        source: ApiLogSource.EBAY,
        operation: "searchListings",
        requestKey: params.keywords,
        cacheHit: true,
        message: "Demo mode fixture load",
        detail: { count: filtered.length },
        scanJobId: context.scanJobId,
        savedSearchId: context.savedSearchId
      });

      return filtered;
    }

    const cacheKey = `ebay:${JSON.stringify(params)}`;
    if (!context.bypassCache) {
      const cached = await readCache<NormalizedEbayListing[]>(cacheKey, 15 * 60_000);
      if (cached) {
        await createApiLog({
          source: ApiLogSource.EBAY,
          operation: "searchListings",
          requestKey: params.keywords,
          cacheHit: true,
          message: "Served from file cache",
          detail: { count: cached.length },
          scanJobId: context.scanJobId,
          savedSearchId: context.savedSearchId
        });

        return cached;
      }
    }

    const accessToken = await this.getAccessToken();
    const query = sanitizeText(
      [params.keywords, ...(params.includeBrands ?? []).map((brand) => `"${brand}"`)].join(" ")
    );
    const filters: string[] = ["itemLocationCountry:CA"];

    if (params.minPrice !== null && params.minPrice !== undefined) {
      filters.push(`price:[${params.minPrice}..]`);
    }
    if (params.maxPrice !== null && params.maxPrice !== undefined) {
      filters.push(`price:[..${params.maxPrice}]`);
    }
    if (params.buyItNowOnly && !params.allowAuctions) {
      filters.push("buyingOptions:{FIXED_PRICE}");
    }
    if (params.conditionFilter) {
      filters.push(`conditions:{${params.conditionFilter}}`);
    }

    const response = await requestWithRetry<{
      itemSummaries?: Array<Record<string, unknown>>;
    }>({
      request: {
        method: "GET",
        url: `${this.baseUrl}/buy/browse/v1/item_summary/search`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA"
        },
        params: {
          q: query,
          category_ids: params.categoryId ?? undefined,
          limit,
          offset: ((params.page ?? 1) - 1) * limit,
          filter: filters.join(","),
          sort: "newlyListed",
          fieldgroups: "EXTENDED"
        }
      },
      onRetry: (attempt, error) => {
        logger.warn({ attempt, error }, "Retrying eBay search request");
      }
    });

    const isThrottled = response.status === 429;
    if (response.status >= 400) {
      await createApiLog({
        source: ApiLogSource.EBAY,
        operation: "searchListings",
        requestKey: params.keywords,
        statusCode: response.status,
        isSuccess: false,
        isThrottled,
        message: "eBay search failed",
        detail: response.data as Record<string, unknown>,
        scanJobId: context.scanJobId,
        savedSearchId: context.savedSearchId
      });
      throw new Error(`eBay search failed with status ${response.status}`);
    }

    const listings = (response.data.itemSummaries ?? []).map((item) => this.normalizeListing(item));
    const filtered = this.filterListings(listings, params);

    if (!context.bypassCache) {
      await writeCache(cacheKey, filtered);
    }
    await createApiLog({
      source: ApiLogSource.EBAY,
      operation: "searchListings",
      requestKey: params.keywords,
      statusCode: response.status,
      message: context.bypassCache ? "eBay search completed with fresh fetch" : "eBay search completed",
      detail: {
        rawCount: listings.length,
        filteredCount: filtered.length,
        bypassCache: context.bypassCache ?? false
      },
      scanJobId: context.scanJobId,
      savedSearchId: context.savedSearchId
    });

    return filtered;
  }

  async getListingDetails(itemId: string): Promise<NormalizedEbayListing | null> {
    const listings = await this.searchListings({ keywords: itemId, limit: 20 });
    return listings.find((listing) => listing.ebayItemId === itemId) ?? null;
  }

  private filterListings(listings: NormalizedEbayListing[], params: SearchListingsParams) {
    const includeBrands = new Set((params.includeBrands ?? []).map((brand) => brand.toLowerCase()));
    const excludeBrands = new Set((params.excludeBrands ?? []).map((brand) => brand.toLowerCase()));

    return listings.filter((listing) => {
      const title = listing.title.toLowerCase();
      const brand = String(listing.brand ?? "").toLowerCase();
      const shipping = listing.shippingCost ?? 0;
      const titleHasIncludedBrand =
        includeBrands.size > 0 && [...includeBrands].some((includeBrand) => title.includes(includeBrand));
      const titleHasExcludedBrand =
        excludeBrands.size > 0 && [...excludeBrands].some((excludeBrand) => title.includes(excludeBrand));

      // eBay Browse already handles keyword relevance. Local filtering should stay permissive so
      // fresh listings are not dropped just because titles use slightly different wording.
      if (includeBrands.size > 0 && !(includeBrands.has(brand) || (!brand && titleHasIncludedBrand))) {
        return false;
      }
      if (excludeBrands.has(brand) || titleHasExcludedBrand) {
        return false;
      }
      if (params.minPrice !== null && params.minPrice !== undefined && listing.currentPrice < params.minPrice) {
        return false;
      }
      if (params.maxPrice !== null && params.maxPrice !== undefined && listing.currentPrice > params.maxPrice) {
        return false;
      }
      if (params.maxShipping !== null && params.maxShipping !== undefined && shipping > params.maxShipping) {
        return false;
      }
      if (
        params.conditionFilter &&
        !String(listing.condition ?? "").toUpperCase().includes(params.conditionFilter.toUpperCase())
      ) {
        return false;
      }
      if (params.buyItNowOnly && !listing.buyingOptions.includes("FIXED_PRICE")) {
        return false;
      }

      return true;
    });
  }

  private normalizeListing(item: Record<string, unknown>): NormalizedEbayListing {
    const price = Number(
      (item.price as { value?: string } | undefined)?.value ??
        (item.currentBidPrice as { value?: string } | undefined)?.value ??
        0
    );
    const shipping =
      Number(
        (item.shippingOptions as Array<{ shippingCost?: { value?: string } }> | undefined)?.[0]?.shippingCost?.value ??
          0
      ) || 0;

    return {
      ebayItemId: String(item.itemId ?? item.itemWebUrl ?? crypto.randomUUID()),
      title: String(item.title ?? "Untitled eBay item"),
      subtitle: String(item.subtitle ?? "") || null,
      condition: String(item.condition ?? "") || null,
      buyingOptions: (item.buyingOptions as string[] | undefined) ?? ["FIXED_PRICE"],
      currentPrice: price,
      shippingCost: shipping,
      itemWebUrl: String(item.itemWebUrl ?? ""),
      imageUrl: (item.image as { imageUrl?: string } | undefined)?.imageUrl ?? null,
      sellerUsername: (item.seller as { username?: string } | undefined)?.username ?? null,
      sellerFeedbackPercentage:
        Number((item.seller as { feedbackPercentage?: string | number } | undefined)?.feedbackPercentage ?? 0) || null,
      sellerFeedbackScore:
        Number((item.seller as { feedbackScore?: string | number } | undefined)?.feedbackScore ?? 0) || null,
      gtin: (item.gtin as string | undefined) ?? null,
      brand: (item.brand as string | undefined) ?? null,
      mpn: (item.mpn as string | undefined) ?? null,
      upc: (item.upc as string | undefined) ?? null,
      categoryPath: (item.categoryPath as string | undefined) ?? null,
      locationCountry:
        (item.itemLocation as { country?: string } | undefined)?.country ??
        (item.itemLocationCountry as string | undefined) ??
        null,
      listingEndAt: (item.itemEndDate as string | undefined) ?? null,
      rawJson: item
    };
  }
}
