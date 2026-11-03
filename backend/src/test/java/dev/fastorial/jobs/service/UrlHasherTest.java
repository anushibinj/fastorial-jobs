package dev.fastorial.jobs.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UrlHasherTest {

    @Test
    void ignoresTrackingParamsFragmentsTrailingSlashAndHostCase() {
        String a = "https://www.linkedin.com/jobs/view/123/?trackingId=abc&utm_source=x#top";
        String b = "https://LinkedIn.com/jobs/view/123";
        assertThat(UrlHasher.hash(a)).isEqualTo(UrlHasher.hash(b));
    }

    @Test
    void keepsMeaningfulQueryParams() {
        assertThat(UrlHasher.hash("https://x.com/job?id=1")).isNotEqualTo(UrlHasher.hash("https://x.com/job?id=2"));
    }

    @Test
    void queryParamOrderDoesNotMatter() {
        assertThat(UrlHasher.hash("https://x.com/j?a=1&b=2")).isEqualTo(UrlHasher.hash("https://x.com/j?b=2&a=1"));
    }

    @Test
    void hashIs64HexChars() {
        assertThat(UrlHasher.hash("https://x.com")).hasSize(64);
    }
}
