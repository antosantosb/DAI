package dai.tub.pgu.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;

import java.awt.Color;
import java.time.ZoneId;
import dai.tub.pgu.domain.ExportJob;
import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.ExportJobDTO;
import dai.tub.pgu.dto.ExportRequestDTO;
import dai.tub.pgu.repository.ExportJobRepository;
import dai.tub.pgu.repository.TelemetryRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Lazy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Motor de Exportação Massiva (Backoffice).
 *
 * Fluxo:
 *   1. Controller chama {@link #submit(ExportRequestDTO)} que persiste um
 *      ExportJob com status PENDING e devolve de imediato o UUID.
 *   2. {@link #runJob(UUID)} corre em thread separada (pool "exportExecutor"),
 *      lê telemetria da DW, escreve CSV ou PDF para disco, atualiza o job
 *      para COMPLETED (ou FAILED) e publica ExportJobDTO em /topic/exports
 *      via STOMP para o Frontend mostrar o aviso "ficheiro pronto".
 *   3. Controller serve o download através de /api/v1/exports/{uuid}/download.
 */
@Service
public class ExportService
{
    private static final Logger log = LoggerFactory.getLogger(ExportService.class);

    private final ExportJobRepository   jobRepo;
    private final TelemetryRepository   telemetryRepo;
    private final SimpMessagingTemplate ws;
    private final ExportService         self; // proxy para @Async funcionar

    @Value("${pgu.export.dir:/tmp/pgu-exports}")
    private String exportDir;

    /** Dias que um relatório permanece em disco antes de ser purgado. */
    @Value("${pgu.export.retention-days:7}")
    private int retentionDays;

    public ExportService(ExportJobRepository jobRepo,
                         TelemetryRepository telemetryRepo,
                         SimpMessagingTemplate ws,
                         @Lazy ExportService self)
    {
        this.jobRepo       = jobRepo;
        this.telemetryRepo = telemetryRepo;
        this.ws            = ws;
        this.self           = self;
    }

    @PostConstruct
    void ensureExportDir() throws Exception
    {
        Files.createDirectories(Paths.get(exportDir));
    }

    // ------------------------------------------------------------------
    // API pública (síncrona): cria o job e dispara o processamento async
    // ------------------------------------------------------------------
    @Transactional
    public ExportJob submit(ExportRequestDTO req)
    {
        ExportJob job = new ExportJob();
        job.setFormat(req.getFormat());
        job.setStatus(ExportJob.Status.PENDING);
        job.setBusIdFilter(req.getBusId());
        job.setFromTs(req.getFrom());
        job.setToTs(req.getTo());
        job.setRequestedBy(req.getRequestedBy());
        jobRepo.save(job);

        // Dispara o processamento em background APÓS o commit da transação,
        // para garantir que runJob encontra o job na BD.
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    self.runJob(job.getJobUuid());
                }
            }
        );
        return job;
    }

    public List<ExportJobDTO> listAll()
    {
        return jobRepo.findAll().stream()
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .map(ExportJobDTO::fromEntity)
            .toList();
    }

    public ExportJob getByUuid(UUID uuid)
    {
        return jobRepo.findByJobUuid(uuid)
            .orElseThrow(() -> new IllegalArgumentException("Export job não encontrado: " + uuid));
    }

    // ------------------------------------------------------------------
    // Gestão de ciclo de vida dos ficheiros
    // ------------------------------------------------------------------

    /**
     * Apaga manualmente um job: remove o ficheiro do disco (se existir) e a
     * linha correspondente em BD. Chamado pelo botão "Apagar" do Backoffice.
     */
    @Transactional
    public void deleteJob(UUID uuid)
    {
        ExportJob job = getByUuid(uuid);
        deleteFileQuietly(job.getFilePath(), uuid);
        jobRepo.delete(job);
        log.info("[EXPORT] Job {} apagado manualmente", uuid);
    }

    /**
     * Purga automática: corre todos os dias às 03:00 (Europe/Lisbon) e apaga
     * ficheiros + rows de jobs concluídos/falhados há mais de {@code retentionDays}.
     * Jobs em PENDING/PROCESSING são ignorados (ainda não têm completedAt).
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "Europe/Lisbon")
    @Transactional
    public void purgeOldExports()
    {
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        List<ExportJob> stale = jobRepo.findByCompletedAtBefore(cutoff);
        if (stale.isEmpty())
        {
            log.info("[EXPORT] Purga: 0 jobs acima de {} dias — nada a fazer", retentionDays);
            return;
        }
        int deleted = 0;
        for (ExportJob job : stale)
        {
            deleteFileQuietly(job.getFilePath(), job.getJobUuid());
            jobRepo.delete(job);
            deleted++;
        }
        log.info("[EXPORT] Purga automática: {} jobs removidos (> {} dias)", deleted, retentionDays);
    }

    private void deleteFileQuietly(String path, UUID uuid)
    {
        if (path == null) return;
        try
        {
            boolean ok = Files.deleteIfExists(Paths.get(path));
            if (ok) log.debug("[EXPORT] Ficheiro apagado: {} (job {})", path, uuid);
        }
        catch (Exception ex)
        {
            log.warn("[EXPORT] Falha ao apagar ficheiro {} do job {}: {}", path, uuid, ex.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // @Async: o coração do Motor de Exportação
    // ------------------------------------------------------------------
    @Async("exportExecutor")
    @Transactional
    public void runJob(UUID jobUuid)
    {
        ExportJob job = jobRepo.findByJobUuid(jobUuid).orElse(null);
        if (job == null) { log.warn("Job {} desapareceu antes de correr", jobUuid); return; }

        log.info("[EXPORT] A iniciar job {} formato={} bus={} from={} to={}",
                 jobUuid, job.getFormat(), job.getBusIdFilter(), job.getFromTs(), job.getToTs());

        job.setStatus(ExportJob.Status.PROCESSING);
        job.setStartedAt(Instant.now());
        jobRepo.save(job);
        notify(job);   // aviso: "o teu relatório está a ser processado"

        try
        {
            // 1. Query telemetria (filtros aplicados em Java para manter simples;
            //    num passo posterior mudar para @Query paginada por janela temporal)
            List<VehicleTelemetry> rows = telemetryRepo.findAll().stream()
                .filter(t -> job.getBusIdFilter() == null || job.getBusIdFilter().equals(t.getBusId()))
                .filter(t -> job.getFromTs() == null || !t.getRecordedAt().isBefore(job.getFromTs()))
                .filter(t -> job.getToTs()   == null || !t.getRecordedAt().isAfter(job.getToTs()))
                .toList();

            // 2. Escrever ficheiro
            String ts       = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                                .withZone(java.time.ZoneOffset.UTC).format(Instant.now());
            String ext      = job.getFormat() == ExportJob.Format.CSV ? "csv" : "pdf";
            String fileName = "telemetry-" + ts + "-" + jobUuid + "." + ext;
            Path   outPath  = Paths.get(exportDir, fileName);

            try (OutputStream os = new FileOutputStream(outPath.toFile()))
            {
                if (job.getFormat() == ExportJob.Format.CSV)  writeCsv(os, rows);
                else                                          writePdf(os, rows, job);
            }

            // 3. Marcar como concluído
            job.setStatus(ExportJob.Status.COMPLETED);
            job.setFilePath(outPath.toString());
            job.setFileName(fileName);
            job.setRowCount((long) rows.size());
            job.setCompletedAt(Instant.now());
            jobRepo.save(job);
            log.info("[EXPORT] Job {} concluído ({} linhas, {})", jobUuid, rows.size(), fileName);
        }
        catch (Exception ex)
        {
            log.error("[EXPORT] Falhou job {}: {}", jobUuid, ex.getMessage(), ex);
            job.setStatus(ExportJob.Status.FAILED);
            job.setErrorMessage(ex.getMessage());
            job.setCompletedAt(Instant.now());
            jobRepo.save(job);
        }
        finally
        {
            // Notificação final: "pronto para download" (ou erro)
            notify(job);
        }
    }

    // ------------------------------------------------------------------
    // Geradores de ficheiro
    // ------------------------------------------------------------------
    private void writeCsv(OutputStream os, List<VehicleTelemetry> rows) throws Exception
    {
        try (BufferedWriter w = new BufferedWriter(new java.io.OutputStreamWriter(os, StandardCharsets.UTF_8)))
        {
            w.write("id,bus_id,recorded_at,latitude,longitude,passenger_count,speed_kmh,status,next_stop,stops_remaining");
            w.newLine();
            for (VehicleTelemetry t : rows)
            {
                double lat = t.getLocation() != null ? t.getLocation().getY() : 0.0;
                double lon = t.getLocation() != null ? t.getLocation().getX() : 0.0;
                w.write(String.join(",",
                    String.valueOf(t.getId()),
                    csv(t.getBusId()),
                    t.getRecordedAt().toString(),
                    String.valueOf(lat),
                    String.valueOf(lon),
                    String.valueOf(t.getPassengers()),
                    t.getSpeedKmh() == null ? "" : t.getSpeedKmh().toString(),
                    csv(t.getStatus()),
                    csv(t.getNextStop()),
                    t.getStopsRemaining() == null ? "" : t.getStopsRemaining().toString()
                ));
                w.newLine();
            }
        }
    }

    /** Escapa vírgulas/aspas para CSV (RFC 4180 minimal). */
    private static String csv(String v)
    {
        if (v == null) return "";
        boolean needsQuote = v.contains(",") || v.contains("\"") || v.contains("\n");
        String esc = v.replace("\"", "\"\"");
        return needsQuote ? "\"" + esc + "\"" : esc;
    }

    // ── Paleta de marca (mesma usada no backoffice) ────────────────────
    private static final Color BRAND_PRIMARY  = new Color(0x6366F1);   // indigo
    private static final Color BRAND_ACCENT   = new Color(0x4F46E5);
    private static final Color TEXT_HEADING   = new Color(0x0F172A);   // slate-900
    private static final Color TEXT_BODY      = new Color(0x334155);   // slate-700
    private static final Color TEXT_MUTED     = new Color(0x64748B);   // slate-500
    private static final Color BORDER_LIGHT   = new Color(0xE2E8F0);   // slate-200
    private static final Color ROW_ZEBRA      = new Color(0xF8FAFC);   // slate-50
    private static final Color STATUS_ACTIVE  = new Color(0x10B981);
    private static final Color STATUS_WARN    = new Color(0xF59E0B);
    private static final Color STATUS_DANGER  = new Color(0xEF4444);
    private static final Color STATUS_NEUTRAL = new Color(0x94A3B8);

    private static final DateTimeFormatter TS_FMT =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("Europe/Lisbon"));

    /** Rodapé com paginação + linha de marca. */
    private static class BrandFooter extends PdfPageEventHelper
    {
        @Override public void onEndPage(PdfWriter writer, Document doc)
        {
            PdfContentByte cb = writer.getDirectContent();
            float x0 = doc.left();
            float x1 = doc.right();
            float y  = doc.bottom() - 14;

            cb.setColorStroke(BORDER_LIGHT);
            cb.setLineWidth(0.5f);
            cb.moveTo(x0, y + 10); cb.lineTo(x1, y + 10); cb.stroke();

            Font f = FontFactory.getFont(FontFactory.HELVETICA, 8, TEXT_MUTED);
            Phrase left  = new Phrase("PGU-TUB · Plataforma de Gestão Urbana", f);
            Phrase right = new Phrase("Página " + writer.getPageNumber(), f);
            com.lowagie.text.pdf.ColumnText.showTextAligned(cb, Element.ALIGN_LEFT,  left,  x0, y, 0);
            com.lowagie.text.pdf.ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, right, x1, y, 0);
        }
    }

    private void writePdf(OutputStream os, List<VehicleTelemetry> rows, ExportJob job) throws Exception
    {
        // Margens generosas: 36pt L/R, top 96 (header), bottom 48 (footer)
        Document doc = new Document(PageSize.A4.rotate(), 36, 36, 96, 48);
        PdfWriter writer = PdfWriter.getInstance(doc, os);
        writer.setPageEvent(new BrandFooter());
        doc.open();

        drawHeader(writer, doc, job);
        addMetadataBlock(doc, job, rows.size());
        doc.add(Chunk.NEWLINE);
        addDataTable(doc, rows);

        doc.close();
    }

    /** Faixa colorida no topo com título + subtítulo em branco. */
    private void drawHeader(PdfWriter writer, Document doc, ExportJob job)
    {
        PdfContentByte cb = writer.getDirectContentUnder();
        float x0 = 0;
        float x1 = doc.getPageSize().getWidth();
        float y1 = doc.getPageSize().getHeight();
        float height = 64;

        // Bloco principal (indigo)
        cb.setColorFill(BRAND_PRIMARY);
        cb.rectangle(x0, y1 - height, x1 - x0, height);
        cb.fill();
        // Linha de accent inferior (mais escura) — toque de profissionalismo
        cb.setColorFill(BRAND_ACCENT);
        cb.rectangle(x0, y1 - height - 3, x1 - x0, 3);
        cb.fill();

        Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18, Color.WHITE);
        Font subFont   = FontFactory.getFont(FontFactory.HELVETICA, 10, new Color(0xE0E7FF));

        com.lowagie.text.pdf.ColumnText.showTextAligned(
            cb, Element.ALIGN_LEFT,
            new Phrase("PGU-TUB · Histórico de Telemetria", titleFont),
            doc.left(), y1 - 28, 0);
        com.lowagie.text.pdf.ColumnText.showTextAligned(
            cb, Element.ALIGN_LEFT,
            new Phrase("Exportação de dados operacionais", subFont),
            doc.left(), y1 - 46, 0);

        // Tag "CONFIDENCIAL" à direita
        Font tagFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, Color.WHITE);
        com.lowagie.text.pdf.ColumnText.showTextAligned(
            cb, Element.ALIGN_RIGHT,
            new Phrase("RELATÓRIO INTERNO", tagFont),
            doc.right(), y1 - 28, 0);
        com.lowagie.text.pdf.ColumnText.showTextAligned(
            cb, Element.ALIGN_RIGHT,
            new Phrase(TS_FMT.format(Instant.now()), subFont),
            doc.right(), y1 - 46, 0);
    }

    /** Bloco de metadados em tabela 2×N (label/value) com visual de "chips". */
    private void addMetadataBlock(Document doc, ExportJob job, int total) throws DocumentException
    {
        PdfPTable meta = new PdfPTable(new float[]{1f, 2.2f, 1f, 2.2f});
        meta.setWidthPercentage(100);
        meta.setSpacingBefore(4);
        meta.setSpacingAfter(12);

        metaCell(meta, "Job ID",        shortUuid(job.getJobUuid()));
        metaCell(meta, "Gerado",        TS_FMT.format(Instant.now()));
        metaCell(meta, "Autocarro",     job.getBusIdFilter() == null ? "Todos" : job.getBusIdFilter());
        metaCell(meta, "Total registos", String.format("%,d", total));

        String janela = (job.getFromTs() == null && job.getToTs() == null)
            ? "Sem filtro temporal"
            : fmtTs(job.getFromTs()) + "   →   " + fmtTs(job.getToTs());
        metaCell(meta, "Janela",        janela);
        metaCell(meta, "Solicitado por", job.getRequestedBy() == null ? "—" : job.getRequestedBy());

        doc.add(meta);
    }

    private void metaCell(PdfPTable t, String label, String value)
    {
        Font labelF = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, TEXT_MUTED);
        Font valueF = FontFactory.getFont(FontFactory.HELVETICA, 10, TEXT_HEADING);

        PdfPCell l = new PdfPCell(new Phrase(label.toUpperCase(), labelF));
        l.setBorder(Rectangle.NO_BORDER);
        l.setPaddingTop(6); l.setPaddingBottom(2); l.setPaddingLeft(0);
        t.addCell(l);

        PdfPCell v = new PdfPCell(new Phrase(value == null ? "—" : value, valueF));
        v.setBorder(Rectangle.NO_BORDER);
        v.setPaddingTop(4); v.setPaddingBottom(4); v.setPaddingLeft(0);
        t.addCell(v);
    }

    /** Tabela de dados com zebra stripes, cabeçalho de marca e badges de estado. */
    private void addDataTable(Document doc, List<VehicleTelemetry> rows) throws DocumentException
    {
        PdfPTable table = new PdfPTable(new float[]{1.1f, 1.9f, 1f, 1f, 0.7f, 0.7f, 1.2f, 1.5f});
        table.setWidthPercentage(100);
        table.setHeaderRows(1);
        table.getDefaultCell().setBorder(Rectangle.NO_BORDER);

        String[] headers = {"Autocarro", "Timestamp", "Latitude", "Longitude", "Pax", "km/h", "Estado", "Próxima paragem"};
        Font hFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Color.WHITE);
        for (String h : headers)
        {
            PdfPCell c = new PdfPCell(new Phrase(h, hFont));
            c.setBackgroundColor(BRAND_PRIMARY);
            c.setBorder(Rectangle.NO_BORDER);
            c.setPaddingTop(8); c.setPaddingBottom(8); c.setPaddingLeft(8); c.setPaddingRight(8);
            c.setHorizontalAlignment(Element.ALIGN_LEFT);
            table.addCell(c);
        }

        Font cFont   = FontFactory.getFont(FontFactory.HELVETICA, 8, TEXT_BODY);
        Font mFont   = FontFactory.getFont(FontFactory.COURIER,   8, TEXT_BODY); // mono para números/coords
        int i = 0;
        for (VehicleTelemetry t : rows)
        {
            Color bg = (i++ % 2 == 0) ? Color.WHITE : ROW_ZEBRA;
            double lat = t.getLocation() != null ? t.getLocation().getY() : 0.0;
            double lon = t.getLocation() != null ? t.getLocation().getX() : 0.0;

            addBodyCell(table, nullSafe(t.getBusId()), cFont, bg, Element.ALIGN_LEFT);
            addBodyCell(table, TS_FMT.format(t.getRecordedAt()), mFont, bg, Element.ALIGN_LEFT);
            addBodyCell(table, String.format("%.5f", lat), mFont, bg, Element.ALIGN_RIGHT);
            addBodyCell(table, String.format("%.5f", lon), mFont, bg, Element.ALIGN_RIGHT);
            addBodyCell(table, String.valueOf(t.getPassengers()), mFont, bg, Element.ALIGN_RIGHT);
            addBodyCell(table, t.getSpeedKmh() == null ? "—" : String.format("%.1f", t.getSpeedKmh()), mFont, bg, Element.ALIGN_RIGHT);
            addStatusBadgeCell(table, t.getStatus(), bg);
            addBodyCell(table, nullSafe(t.getNextStop()), cFont, bg, Element.ALIGN_LEFT);
        }

        doc.add(table);
    }

    private void addBodyCell(PdfPTable t, String text, Font font, Color bg, int align)
    {
        PdfPCell c = new PdfPCell(new Phrase(text, font));
        c.setBackgroundColor(bg);
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(BORDER_LIGHT);
        c.setBorderWidth(0.3f);
        c.setPaddingTop(5); c.setPaddingBottom(5); c.setPaddingLeft(8); c.setPaddingRight(8);
        c.setHorizontalAlignment(align);
        t.addCell(c);
    }

    /** Badge colorido de estado (chip arredondado via fundo colorido claro + texto forte). */
    private void addStatusBadgeCell(PdfPTable t, String status, Color bg)
    {
        String s = status == null ? "—" : status.toLowerCase();
        String label;
        Color fg;
        switch (s)
        {
            case "active":   label = "Ativo";       fg = STATUS_ACTIVE;  break;
            case "at-stop":
            case "stopped":  label = "Em paragem";  fg = STATUS_NEUTRAL; break;
            case "stopping": label = "A parar";     fg = STATUS_WARN;    break;
            case "delayed":  label = "Atrasado";    fg = STATUS_DANGER;  break;
            default:         label = status == null ? "—" : status; fg = TEXT_MUTED;
        }

        Font badgeFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, fg);
        PdfPCell c = new PdfPCell(new Phrase(label, badgeFont));
        c.setBackgroundColor(bg);
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(BORDER_LIGHT);
        c.setBorderWidth(0.3f);
        c.setPaddingTop(5); c.setPaddingBottom(5); c.setPaddingLeft(8); c.setPaddingRight(8);
        c.setHorizontalAlignment(Element.ALIGN_LEFT);
        t.addCell(c);
    }

    private static String shortUuid(UUID u) { return u == null ? "—" : u.toString().substring(0, 8) + "…"; }
    private static String fmtTs(Instant i)  { return i == null ? "—" : TS_FMT.format(i); }
    private static String nullSafe(String s) { return s == null ? "—" : s; }

    // ------------------------------------------------------------------
    // Notificação WebSocket
    // ------------------------------------------------------------------
    private void notify(ExportJob job)
    {
        ExportJobDTO dto = ExportJobDTO.fromEntity(job);
        // broadcast geral
        ws.convertAndSend("/topic/exports", dto);
        // canal específico do utilizador
        if (job.getRequestedBy() != null)
            ws.convertAndSend("/topic/exports/" + job.getRequestedBy(), dto);
    }
}
