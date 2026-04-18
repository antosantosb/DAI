import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import api from '../services/api';

// Braga Center Coordinates
const DEFAULT_CENTER = [41.55032, -8.42005];

export default function HeatmapAnalytics() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const res = await api.get('/analytics/heatmap');
        // leaflet.heat expects [lat, lng, intensity]
        const points = (res.data || []).map(p => [p.lat, p.lng, p.passengerCount * 3]);

        if (heatLayerRef.current && mapInstance.current) {
          mapInstance.current.removeLayer(heatLayerRef.current);
        }
        
        if (points.length > 0 && mapInstance.current) {
          heatLayerRef.current = L.heatLayer(points, {
             radius: 20,
             blur: 15,
             maxZoom: 16,
             max: 80, 
             gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
          }).addTo(mapInstance.current);
        }
      } catch(err) {
        console.error('Error fetching heatmap', err);
      }
    };

    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, 60000); // 1-minute updates
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height: '400px', 
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        zIndex: 0 
      }} 
    />
  );
}
