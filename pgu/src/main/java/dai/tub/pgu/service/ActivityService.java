package dai.tub.pgu.service;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import dai.tub.pgu.dto.ActivityItem;

/**
 * Sprint 2 (estilo BRT): "activity feed" unificado (read-only).
 *
 * <p>Agrega os eventos recentes do sistema vindos de tres fontes distintas e
 * normaliza-os para {@link ActivityItem}, ordenados por timestamp decrescente.
 * Usa {@link JdbcTemplate} no mesmo estilo do {@link AnalyticsService}: SQL em
 * text block, {@code UNION ALL} das fontes e {@code TO_CHAR(... AT TIME ZONE
 * 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')} para o timestamp local.
 *
 * <p>Fontes e colunas reais agregadas:
 * <ul>
 *   <li><b>historico_alertas</b> (V11): {@code data} -> timestamp,
 *       {@code motivo} -> title, {@code autocarro} -> actor. category "ALERTA".</li>
 *   <li><b>ocorrencias</b> (V15): {@code timestamp_abertura} -> timestamp,
 *       {@code tipo_anomalia} (+ estado) -> title, {@code descricao} -> description,
 *       {@code responsavel} (fallback {@code criado_por}) -> actor. category "OCORRENCIA".</li>
 *   <li><b>audit_log</b> (V12): {@code created_at} -> timestamp, {@code action}
 *       (+ class_name.method) -> title/description, {@code username} -> actor.
 *       category "AUDIT".</li>
 * </ul>
 */
@Service
public class ActivityService {

    /** Numero de itens devolvido por omissao quando o cliente nao indica limit. */
    private static final int DEFAULT_LIMIT = 50;

    /** Tecto de seguranca para o limit (evita varreduras grandes). */
    private static final int MAX_LIMIT = 200;

    private final JdbcTemplate jdbcTemplate;

    public ActivityService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Devolve os eventos recentes agregados das tres fontes, ja normalizados e
     * ordenados por timestamp decrescente.
     *
     * @param limit numero maximo de itens; nulo ou &lt;= 0 usa o default (50),
     *              valores acima de {@value #MAX_LIMIT} sao limitados a esse tecto.
     */
    public List<ActivityItem> getRecentActivity(Integer limit) {
        int effectiveLimit = normalizeLimit(limit);

        // UNION ALL das tres fontes. Cada subquery projeta as colunas reais para
        // a forma comum (recorded_at, category, title, description, actor). O
        // recorded_at e' depois formatado no fuso Europe/Lisbon na query externa.
        String sql = """
                SELECT
                    TO_CHAR(t.recorded_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS ts_label,
                    t.category,
                    t.title,
                    t.description,
                    t.actor
                FROM (
                    SELECT
                        h.data                                          AS recorded_at,
                        'ALERTA'                                        AS category,
                        h.motivo                                        AS title,
                        NULL                                            AS description,
                        h.autocarro                                     AS actor
                    FROM historico_alertas h
                    UNION ALL
                    SELECT
                        o.timestamp_abertura                            AS recorded_at,
                        'OCORRENCIA'                                    AS category,
                        o.tipo_anomalia || ' (' || o.estado || ')'      AS title,
                        o.descricao                                     AS description,
                        COALESCE(o.responsavel, o.criado_por)           AS actor
                    FROM ocorrencias o
                    UNION ALL
                    SELECT
                        a.created_at                                    AS recorded_at,
                        'AUDIT'                                         AS category,
                        a.action                                        AS title,
                        a.class_name || '.' || a.method                 AS description,
                        a.username                                      AS actor
                    FROM audit_log a
                ) t
                ORDER BY t.recorded_at DESC
                LIMIT ?
                """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> new ActivityItem(
                rs.getString("ts_label"),
                rs.getString("category"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("actor")
        ), effectiveLimit);
    }

    /** Aplica default e tecto ao limit pedido pelo cliente. */
    private static int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }
}
