import React, { useState, useEffect } from 'react';
import api from '../services/api';
import StatIcon from '../components/StatIcon';

export default function GlobalConfig() {
    const [configs, setConfigs] = useState({
        delayLimitMinutes: 5,
        socTolerancePercent: 20,
        iotIntegrationLimit: 1000
    });
    const [loading, setLoading] = useState(true);

    // Carregar as configurações atuais quando a página abre
    useEffect(() => {
        api.get('/api/v1/config')
            .then(response => {
                setConfigs(response.data);
                setLoading(false);
            })
            .catch(error => {
                console.error("Erro ao carregar configurações globais:", error);
                setLoading(false);
            });
    }, []);

    // Guardar as novas configurações
    const handleSave = async (e) => {
        e.preventDefault();
        try {
            await api.put('/api/v1/config', configs);
            alert('Parâmetros atualizados com sucesso!');
        } catch (error) {
            console.error("Erro ao guardar:", error);
            alert('Erro ao atualizar. Garante que tens permissões de Administrador.');
        }
    };

    if (loading) return <div className="p-6">A carregar configurações...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <StatIcon type="speed" />
                <h1 className="text-2xl font-bold text-gray-800">Parâmetros Globais do Sistema</h1>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <form onSubmit={handleSave} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Limite de Atraso Tolerável (Minutos)
                        </label>
                        <p className="text-xs text-gray-500 mb-2">Atrasos superiores a este valor geram alertas automáticos.</p>
                        <input 
                            type="number" 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={configs.delayLimitMinutes} 
                            onChange={e => setConfigs({...configs, delayLimitMinutes: parseInt(e.target.value)})} 
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tolerância de Bateria Crítica - SoC (%)
                        </label>
                        <p className="text-xs text-gray-500 mb-2">Para a frota elétrica, emite aviso se a bateria descer abaixo deste valor.</p>
                        <input 
                            type="number" 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={configs.socTolerancePercent} 
                            onChange={e => setConfigs({...configs, socTolerancePercent: parseInt(e.target.value)})} 
                            required
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
                    >
                        Guardar Alterações
                    </button>
                </form>
            </div>
        </div>
    );
}