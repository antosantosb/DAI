package dai.tub.pgu.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.Operator;
import dai.tub.pgu.dto.OperatorDTO;
import dai.tub.pgu.repository.OperatorRepository;
import dai.tub.pgu.repository.RouteRepository;

/**
 * Sprint 1 (F0): operadores de transporte.
 */
@Service
public class OperatorService
{
    private final OperatorRepository operatorRepository;
    private final RouteRepository routeRepository;

    public OperatorService(OperatorRepository operatorRepository, RouteRepository routeRepository)
    {
        this.operatorRepository = operatorRepository;
        this.routeRepository = routeRepository;
    }

    public List<OperatorDTO> getAll()
    {
        return operatorRepository.findAll().stream()
                .map(this::toDtoWithCount)
                .toList();
    }

    public OperatorDTO getById(Long id)
    {
        Operator op = operatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Operador não encontrado: " + id));
        return toDtoWithCount(op);
    }

    /**
     * Sprint 1 (F0): enriquece o DTO com a contagem de rotas associadas.
     */
    private OperatorDTO toDtoWithCount(Operator op)
    {
        OperatorDTO dto = OperatorDTO.fromEntity(op);
        if (dto != null && op.getId() != null) {
            dto.setRouteCount(routeRepository.countByOperator_Id(op.getId()));
        }
        return dto;
    }

    @Transactional
    public OperatorDTO create(OperatorDTO dto)
    {
        validate(dto, null);
        Operator op = new Operator();
        applyDto(op, dto);
        return OperatorDTO.fromEntity(operatorRepository.save(op));
    }

    @Transactional
    public OperatorDTO update(Long id, OperatorDTO dto)
    {
        Operator op = operatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Operador não encontrado: " + id));
        validate(dto, id);
        applyDto(op, dto);
        return OperatorDTO.fromEntity(operatorRepository.save(op));
    }

    @Transactional
    public void delete(Long id)
    {
        operatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Operador não encontrado: " + id));
        operatorRepository.deleteById(id);
    }

    /**
     * Valida code/name/country. {@code currentId} permite tolerar o proprio
     * registo num update (i.e., manter o mesmo {@code code}).
     */
    private void validate(OperatorDTO dto, Long currentId)
    {
        if (dto.getCode() == null || dto.getCode().isBlank()) {
            throw new IllegalArgumentException("O código do operador é obrigatório.");
        }
        if (dto.getName() == null || dto.getName().isBlank()) {
            throw new IllegalArgumentException("O nome do operador é obrigatório.");
        }
        operatorRepository.findByCode(dto.getCode()).ifPresent(existing -> {
            if (currentId == null || !existing.getId().equals(currentId)) {
                throw new IllegalArgumentException(
                        "Já existe um operador com o código '" + dto.getCode() + "'.");
            }
        });
    }

    private void applyDto(Operator op, OperatorDTO dto)
    {
        op.setCode(dto.getCode().trim());
        op.setName(dto.getName().trim());
        op.setTaxId(blankToNull(dto.getTaxId()));
        op.setCountry(dto.getCountry() != null && !dto.getCountry().isBlank()
                ? dto.getCountry().trim().toUpperCase()
                : "PT");
        op.setContactEmail(blankToNull(dto.getContactEmail()));
    }

    private String blankToNull(String s)
    {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
