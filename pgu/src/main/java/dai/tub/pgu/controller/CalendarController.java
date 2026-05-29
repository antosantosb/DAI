package dai.tub.pgu.controller;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.service.CalendarService;

/**
 * Sprint 1 (F4): calendario operacional (R.IVT.05).
 * Autenticado (ferramenta interna de backoffice) — coberto pelo catch-all
 * GET /api/v1/** authenticated do SecurityConfig.
 */
@RestController
@RequestMapping("/api/v1/calendar")
public class CalendarController
{
    private final CalendarService calendarService;

    public CalendarController(CalendarService calendarService)
    {
        this.calendarService = calendarService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getCalendar(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to)
    {
        List<Map<String, Object>> days = calendarService.getCalendar(from, to);
        return ResponseEntity.ok(Map.of(
                "hasData", calendarService.hasCalendarData(),
                "days", days));
    }
}
