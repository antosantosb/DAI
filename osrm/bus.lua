-- Bus routing profile para OSRM
-- Baseia-se no car.lua padrão do OSRM (para garantir compatibilidade da API)

api_version = 4

local car_profile = require('car')
local Sequence = require('lib/sequence')
local Set = require('lib/set')

function setup()
    local profile = car_profile.setup()

    profile.properties.weight_name = 'routability'

    -- CORREÇÃO: O OSRM exige que as velocidades estejam dentro de um 'Sequence' 
    -- e agrupadas por categorias de tags (neste caso, 'highway')
    profile.speeds = Sequence {
        highway = {
            motorway        = 10,
            motorway_link   = 10,
            trunk           = 15,
            trunk_link      = 15,
            primary         = 45,
            primary_link    = 35,
            secondary       = 40,
            secondary_link  = 30,
            tertiary        = 35,
            tertiary_link   = 25,
            unclassified    = 30,
            residential     = 30,
            living_street   = 15,
            service         = 15
        }
    }

    profile.default_speed = 30

    -- Mesma estrutura rigorosa para as hierarquias de acesso
    profile.access_tags_hierarchy = Sequence {
        'bus',
        'psv',
        'motorcar',
        'motor_vehicle',
        'vehicle',
        'access'
    }

    -- Set é usado para tags que queremos banir (O(1) lookup)
    profile.avoid = Set {
        'toll'
    }

    return profile
end

return {
    setup = setup,
    process_way = car_profile.process_way,
    process_node = car_profile.process_node,
    process_turn = car_profile.process_turn
}