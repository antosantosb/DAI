package dai.tub.pgu.service;

import java.time.LocalDate;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Sprint 1 (F4): calendario operacional (R.IVT.05).
 *
 * <p>Para um intervalo de datas, calcula que servicos GTFS estao activos em
 * cada dia (a partir do service_calendar + excecoes em service_calendar_date),
 * e mapeia esses servicos para rotas e contagem de viagens (via tabela trip).
 */
@Service
public class CalendarService
{
    private final JdbcTemplate jdbc;

    public CalendarService(JdbcTemplate jdbc)
    {
        this.jdbc = jdbc;
    }

    /** Padrao semanal de um servico. */
    private record ServiceCal(String serviceId, boolean[] weekdays, LocalDate start, LocalDate end) {}

    /**
     * Devolve um resumo por dia: data, rotas activas (ids + codigos), e total
     * de viagens. {@code from}/{@code to} inclusive. Intervalo limitado a 92 dias.
     */
    public List<Map<String, Object>> getCalendar(LocalDate from, LocalDate to)
    {
        if (from == null || to == null || to.isBefore(from)) return List.of();
        if (from.plusDays(92).isBefore(to)) to = from.plusDays(92);

        // 1. service_calendar (padrao semanal)
        List<ServiceCal> cals = jdbc.query(
            "SELECT service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, "
            + "start_date, end_date FROM service_calendar",
            (rs, i) -> new ServiceCal(
                rs.getString("service_id"),
                new boolean[]{
                    rs.getBoolean("monday"), rs.getBoolean("tuesday"), rs.getBoolean("wednesday"),
                    rs.getBoolean("thursday"), rs.getBoolean("friday"), rs.getBoolean("saturday"),
                    rs.getBoolean("sunday")
                },
                rs.getDate("start_date") != null ? rs.getDate("start_date").toLocalDate() : null,
                rs.getDate("end_date") != null ? rs.getDate("end_date").toLocalDate() : null));

        // 2. excecoes (calendar_dates) no intervalo: date -> {serviceId -> type}
        Map<LocalDate, Map<String, Integer>> exceptions = new HashMap<>();
        jdbc.query(
            "SELECT service_id, exception_date, exception_type FROM service_calendar_date "
            + "WHERE exception_date BETWEEN ? AND ?",
            rs -> {
                LocalDate d = rs.getDate("exception_date").toLocalDate();
                exceptions.computeIfAbsent(d, k -> new HashMap<>())
                          .put(rs.getString("service_id"), rs.getInt("exception_type"));
            }, java.sql.Date.valueOf(from), java.sql.Date.valueOf(to));

        // 3. service_id -> rotas (id) e contagem de trips (a partir da tabela trip:
        //    cada linha de trip e' uma viagem distinta, com service_id e route_id).
        Map<String, Set<Long>> serviceRoutes = new HashMap<>();
        jdbc.query("SELECT DISTINCT service_id, route_id FROM trip WHERE service_id IS NOT NULL",
            rs -> {
                serviceRoutes.computeIfAbsent(rs.getString("service_id"), k -> new HashSet<>())
                             .add(rs.getLong("route_id"));
            });

        Map<String, Integer> serviceTrips = new HashMap<>();
        jdbc.query("SELECT service_id, COUNT(*) AS trips FROM trip "
            + "WHERE service_id IS NOT NULL GROUP BY service_id",
            rs -> { serviceTrips.put(rs.getString("service_id"), rs.getInt("trips")); });

        // 4. rotas: id -> code
        Map<Long, String> routeCodes = new HashMap<>();
        jdbc.query("SELECT id, code FROM routes",
            rs -> { routeCodes.put(rs.getLong("id"), rs.getString("code")); });

        // 5. iterar dias
        List<Map<String, Object>> result = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            Set<String> active = activeServices(day, cals, exceptions.get(day));

            Set<Long> routeIds = new HashSet<>();
            int totalTrips = 0;
            for (String svc : active) {
                Set<Long> r = serviceRoutes.get(svc);
                if (r != null) routeIds.addAll(r);
                totalTrips += serviceTrips.getOrDefault(svc, 0);
            }

            Set<String> codes = new TreeSet<>();
            List<Long> ids = new ArrayList<>();
            for (Long rid : routeIds) {
                ids.add(rid);
                String c = routeCodes.get(rid);
                if (c != null) codes.add(c);
            }

            Map<String, Object> dayObj = new LinkedHashMap<>();
            dayObj.put("date", day.toString());
            dayObj.put("dayOfWeek", day.getDayOfWeek().getValue()); // 1=Mon..7=Sun
            dayObj.put("routeCount", routeIds.size());
            dayObj.put("routeIds", ids);
            dayObj.put("routeCodes", new ArrayList<>(codes));
            dayObj.put("totalTrips", totalTrips);
            result.add(dayObj);
        }
        return result;
    }

    /** Servicos activos num dia: padrao semanal ∩ intervalo, com excecoes aplicadas. */
    private Set<String> activeServices(LocalDate day, List<ServiceCal> cals,
                                       Map<String, Integer> dayExceptions)
    {
        Set<String> active = new HashSet<>();
        int dow = day.getDayOfWeek().getValue() - 1; // 0=Mon..6=Sun

        for (ServiceCal c : cals) {
            boolean inRange = (c.start() == null || !day.isBefore(c.start()))
                           && (c.end() == null || !day.isAfter(c.end()));
            if (inRange && c.weekdays()[dow]) active.add(c.serviceId());
        }
        // Excecoes: type 1 adiciona, type 2 remove
        if (dayExceptions != null) {
            for (Map.Entry<String, Integer> e : dayExceptions.entrySet()) {
                if (e.getValue() == 1) active.add(e.getKey());
                else if (e.getValue() == 2) active.remove(e.getKey());
            }
        }
        // Caso o feed so' tenha calendar_dates (sem calendar.txt): os servicos
        // adicionados por excecao ja' entram acima via type 1.
        return active;
    }

    /** Indica se ha' dados de calendario importados (para o frontend avisar). */
    public boolean hasCalendarData()
    {
        Integer n = jdbc.queryForObject(
            "SELECT (SELECT COUNT(*) FROM service_calendar) + "
            + "(SELECT COUNT(*) FROM service_calendar_date)", Integer.class);
        return n != null && n > 0;
    }
}
