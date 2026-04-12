import { schedulerService } from "../services/scheduler/schedulerService";

export function startScheduledJobs() {
  schedulerService.start();
}
