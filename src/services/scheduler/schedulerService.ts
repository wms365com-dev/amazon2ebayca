import cron, { ScheduledTask } from "node-cron";
import { runDueSearchScans } from "./dueScanRunner";

class SchedulerService {
  private task: ScheduledTask | null = null;

  start() {
    if (this.task) {
      return;
    }

    this.task = cron.schedule("* * * * *", () => {
      void this.tick();
    });
  }

  stop() {
    this.task?.stop();
    this.task = null;
  }

  private async tick() {
    await runDueSearchScans("scheduler");
  }
}

export const schedulerService = new SchedulerService();
