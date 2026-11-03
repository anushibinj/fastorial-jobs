package dev.fastorial.jobs.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "tag_aliases")
@Getter
@Setter
@NoArgsConstructor
public class TagAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "tag_id")
    private Tag tag;

    @Column(nullable = false)
    private String alias;

    @Column(name = "case_sensitive", nullable = false)
    private boolean caseSensitive;
}
