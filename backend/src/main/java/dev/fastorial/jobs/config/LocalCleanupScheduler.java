package dev.fastorial.jobs.config;

import dev.fastorial.jobs.service.JobService;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Dev convenience only. In production Cloud Scheduler calls the internal endpoint instead. */
@Configuration
@EnableScheduling
@Profile("local")
public class LocalCleanupScheduler {

    private final JobService jobs;

    public LocalCleanupScheduler(JobService jobs) {
        this.jobs = jobs;
    }

    @Scheduled(cron = "0 0 2 * * *", zone = "Asia/Kolkata")
    void run() {
        jobs.closeExpiredJobs();
    }
}
