package dai.tub.pgu.repository;

import dai.tub.pgu.domain.DataSourcePulse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface DataSourcePulseRepository extends JpaRepository<DataSourcePulse, Long> {

    /**
     * Sprint 0 (F4): percentagem de tempo em HEALTHY na janela {@code since..now()}.
     * Conta linhas com status='HEALTHY' / total de linhas com status conhecido.
     * Devolve null se nao houver pulses na janela (uptime indefinido).
     */
    @Query(value = """
        SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                    ELSE ROUND(100.0 * SUM(CASE WHEN status = 'HEALTHY' THEN 1 ELSE 0 END) / COUNT(*), 2)
               END
        FROM data_source_pulse
        WHERE data_source_id = :dataSourceId
          AND ts >= :since
          AND status <> 'UNKNOWN'
        """, nativeQuery = true)
    Double computeUptimePct(@Param("dataSourceId") Long dataSourceId,
                             @Param("since") OffsetDateTime since);

    void deleteByDataSourceIdAndTsBefore(Long dataSourceId, OffsetDateTime cutoff);

    /**
     * Sprint 0 (F4 follow-up): timeline de respostas para o chart na pagina Fontes.
     * Devolve buckets de tamanho {@code bucketSeconds} entre {@code since} e {@code until},
     * com total de pulses, count de HEALTHY e percentagem OK por bucket por fonte.
     *
     * <p>Indices: dataSourceId, dataSourceName, bucketTs, total, healthy, okPct.
     */
    @Query(value = """
        WITH bucketed AS (
            SELECT
                dsp.data_source_id AS ds_id,
                ds.nome            AS ds_nome,
                to_timestamp(floor(extract(epoch FROM dsp.ts) / :bucketSeconds) * :bucketSeconds) AS bucket_ts,
                dsp.status         AS ds_status
            FROM data_source_pulse dsp
            JOIN data_source ds ON ds.id = dsp.data_source_id
            WHERE dsp.ts >= :since
              AND dsp.ts <  :until
              AND (:dataSourceId IS NULL OR dsp.data_source_id = :dataSourceId)
        )
        SELECT
            ds_id     AS dataSourceId,
            ds_nome   AS dataSourceName,
            bucket_ts AS bucketTs,
            COUNT(*)  AS total,
            SUM(CASE WHEN ds_status = 'HEALTHY' THEN 1 ELSE 0 END) AS healthy,
            ROUND(100.0 * SUM(CASE WHEN ds_status = 'HEALTHY' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS okPct
        FROM bucketed
        GROUP BY ds_id, ds_nome, bucket_ts
        ORDER BY bucket_ts, ds_nome
        """, nativeQuery = true)
    List<Object[]> findTimeline(@Param("since") OffsetDateTime since,
                                @Param("until") OffsetDateTime until,
                                @Param("bucketSeconds") long bucketSeconds,
                                @Param("dataSourceId") Long dataSourceId);
}
