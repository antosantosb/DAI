package dai.tub.pgu.repository;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.BusDuty;

/**
 * Fase E (E-back-1): repositorio da escala (bus_duty).
 *
 * Notas:
 *   - As queries que tocam multiplos campos relacionais usam JOIN FETCH para
 *     evitar N+1 ao construir o DTO denormalizado.
 *   - findByBusIdAndServiceDateAndStatus serve a logica de transicao de
 *     estado do bus (E-back-2): contar duties RUNNING / DONE / PLANNED.
 */
@Repository
public interface BusDutyRepository extends JpaRepository<BusDuty, Long>
{
    /** Escala completa de um bus num dia, por ordem cronologica. */
    @Query("SELECT d FROM BusDuty d "
         + "JOIN FETCH d.bus b "
         + "JOIN FETCH d.trip t JOIN FETCH t.route r JOIN FETCH t.pattern p "
         + "WHERE b.id = :busId AND d.serviceDate = :serviceDate "
         + "ORDER BY d.sequence ASC")
    List<BusDuty> findByBusIdAndServiceDateOrderBySequence(@Param("busId") Long busId,
                                                            @Param("serviceDate") LocalDate serviceDate);

    /** Existe atribuicao desta trip neste dia (em qualquer bus). */
    boolean existsByTripIdAndServiceDate(Long tripId, LocalDate serviceDate);

    /** Duties de um bus num dia filtrados por status (RUNNING, DONE, ...). */
    List<BusDuty> findByBusIdAndServiceDateAndStatus(Long busId, LocalDate serviceDate, String status);

    /**
     * Fase E (E-back-2): proxima duty PLANNED por ordem de sequence (apos a
     * actualmente RUNNING). Usado quando o motorista arranca o servico ou
     * quando uma trip termina e e' preciso promover a seguinte a RUNNING.
     */
    @Query("SELECT d FROM BusDuty d "
         + "JOIN FETCH d.bus b "
         + "JOIN FETCH d.trip t "
         + "WHERE b.id = :busId AND d.serviceDate = :serviceDate AND d.status = 'PLANNED' "
         + "ORDER BY d.sequence ASC")
    List<BusDuty> findPlannedByBusAndDateOrderBySequence(@Param("busId") Long busId,
                                                         @Param("serviceDate") LocalDate serviceDate);

    /**
     * Fase E (E-back-2): a duty RUNNING (no maximo uma) deste bus num dado dia.
     * Devolve lista (em vez de Optional) porque o caller controla o caso
     * "nao ha nenhuma" (start) e o "ha uma e e' suposto haver" (end).
     */
    @Query("SELECT d FROM BusDuty d "
         + "JOIN FETCH d.bus b "
         + "JOIN FETCH d.trip t "
         + "WHERE b.id = :busId AND d.serviceDate = :serviceDate AND d.status = 'RUNNING'")
    List<BusDuty> findRunningByBusAndDate(@Param("busId") Long busId,
                                          @Param("serviceDate") LocalDate serviceDate);

    /** Calendario: todas as duties de um dia, agrupavel no frontend por bus. */
    @Query("SELECT d FROM BusDuty d "
         + "JOIN FETCH d.bus b "
         + "JOIN FETCH d.trip t JOIN FETCH t.route r JOIN FETCH t.pattern p "
         + "WHERE d.serviceDate = :serviceDate "
         + "ORDER BY b.busCode ASC, d.sequence ASC")
    List<BusDuty> findByServiceDateFull(@Param("serviceDate") LocalDate serviceDate);

    /** Apagar APENAS duties PLANNED de um bus num dia.
     *
     * Sprint 5: nao mexe em DONE (historico operacional preservado para
     * auditoria/Calendar), nem em RUNNING (escala em curso nao pode ser
     * eliminada — o motorista tem de a terminar primeiro), nem em
     * CANCELLED/INTERRUPTED (auditoria). So' as PLANNED futuras saem.
     */
    @Modifying
    @Query("DELETE FROM BusDuty d WHERE d.bus.id = :busId AND d.serviceDate = :serviceDate AND d.status = 'PLANNED'")
    int deletePlannedByBusIdAndServiceDate(@Param("busId") Long busId,
                                           @Param("serviceDate") LocalDate serviceDate);

    /** Sumario para o Calendar (#4a follow-up: substitui o GTFS calendar):
     *  por cada dia/bus no intervalo, devolve [date, busCode, tripCount].
     *  O service agrega em Java por dia para popular totalTrips, busCount e
     *  a lista de busCodes (usada no modal do calendar). */
    @Query("SELECT d.serviceDate, b.busCode, COUNT(d.id) "
         + "FROM BusDuty d JOIN d.bus b "
         + "WHERE d.serviceDate BETWEEN :from AND :to "
         + "GROUP BY d.serviceDate, b.busCode "
         + "ORDER BY d.serviceDate ASC, b.busCode ASC")
    List<Object[]> summaryByDayAndBus(@Param("from") LocalDate from,
                                       @Param("to") LocalDate to);
}
