"use client";

import { useEffect, useState, useMemo } from "react";
import { insforge } from "./insforge-client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { BellRing, Activity, AlertTriangle, WifiOff, Wifi } from "lucide-react";
import Image from "next/image";

// -- Definición tipada de la nueva tabla de base de datos --
interface SensorData {
  id: string;
  created_at: string;
  temp: number;
  hum: number;
  ppm: number;
  mov_count: number;
  mov_percent: number;
  is_alert: boolean;
  alert_level: string;
  baseline_ppm: number;
  is_emergency: boolean;
}

export function Dashboard({ dashboardUrl }: { dashboardUrl: string }) {
  const [data, setData] = useState<SensorData[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState<{ message: string; visible: boolean; isCritical: boolean; title?: string }>({ message: "", visible: false, isCritical: false });
  const [isOffline, setIsOffline] = useState(false);

  // Guardamos el ID del último registro procesado para saber cuándo llega uno nuevo
  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);
  const [nextReportIn, setNextReportIn] = useState(60);
  
  // Estados para el Historial y Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<SensorData | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchData();
    
    // -- El ESP32 envía cada 60s, nosotros hacemos polling cada 5s para no saturar --
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // -- Lógica del Cronómetro de Próximo Reporte --
  useEffect(() => {
    const timer = setInterval(() => {
      if (data.length > 0) {
        const latestTime = new Date(data[0].created_at).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - latestTime) / 1000);
        
        // El ESP32 reporta cada 60s. Calculamos cuánto falta para el siguiente.
        const remaining = 60 - (elapsedSeconds % 60);
        setNextReportIn(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [data]);

  // -- Evaluar si el dispositivo está offline --
  useEffect(() => {
    if (data.length > 0) {
      const latestData = data[0];
      const latestTime = new Date(latestData.created_at).getTime();
      const now = Date.now();
      
      // Si han pasado más de 2.5 minutos (150,000 ms) sin datos, asumimos que se desconectó
      // (Dado que el ESP32 envía cada 1 minuto)
      if (now - latestTime > 150000) {
        setIsOffline(true);
      } else {
        setIsOffline(false);
      }

      // -- Lógica de notificaciones --
      if (latestData.id !== lastProcessedId) {
        setLastProcessedId(latestData.id);
        
        // Si es un dato nuevo y es emergencia, toast rojo inmediato
        if (latestData.is_emergency) {
          let msg = `¡PELIGRO! Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm`;
          setToast({ message: msg, visible: true, isCritical: true, title: "¡ALERTA DE EMERGENCIA!" });
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 10000);
        } else if (latestData.alert_level === 'warning') {
          let msg = `Advertencia - Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm`;
          setToast({ message: msg, visible: true, isCritical: false, title: "Reporte de Riesgo Medio" });
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 8000);
        }
      }
    }
  }, [data, lastProcessedId]);

  async function fetchData() {
    // -- Ahora leemos directamente de la tabla tipada, sin parseos raros de JSON --
    const { data: rawData, error } = await insforge.database
      .from("sensor_readings")
      .select()
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!error && rawData) {
      setData(rawData as SensorData[]);
    }
  }

  // Filter logic
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (!startDate && !endDate) return true;
      const dTime = new Date(d.created_at).getTime();
      const sTime = startDate ? new Date(startDate).getTime() : 0;
      const eTime = endDate ? new Date(endDate).getTime() : Infinity;
      return dTime >= sTime && dTime <= eTime;
    });
  }, [data, startDate, endDate]);

  // Lógica de Paginación
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const latest = useMemo(() => {
    if (isOffline || data.length === 0) {
      return { temp: 0, hum: 0, ppm: 0, mov_percent: 0, baseline_ppm: 0, id: 'offline' };
    }
    return data[0];
  }, [data, isOffline]);

  // Helpers para la UI con colores basados en la nueva paleta y tailwind
  const getTempStatus = (t: number) => {
    if (t === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    if (t < 10 || t > 40) return { color: "text-[#EF4444]", text: "TEMP. CRÍTICA", bg: "bg-[#EF4444]" };
    if (t < 15 || t > 35) return { color: "text-[#F59E0B]", text: "TEMP. ANORMAL", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "TEMPERATURA IDEAL", bg: "bg-[#22C55E]" };
  };
  
  const getHumStatus = (h: number) => {
    if (h === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    if (h < 20 || h > 70) return { color: "text-[#EF4444]", text: "HUMEDAD CRÍTICA", bg: "bg-[#EF4444]" };
    if (h < 30 || h > 60) return { color: "text-[#F59E0B]", text: "HUMEDAD ANORMAL", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "HUMEDAD ÓPTIMA", bg: "bg-[#22C55E]" };
  };

  const getGasStatus = (g: number, base: number) => {
    if (g === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    if (g > base * 3 || g > 1000) return { color: "text-[#EF4444]", text: "ALERTA MÁXIMA", bg: "bg-[#EF4444]" };
    if (g > base * 1.5 || g > 300) return { color: "text-[#F59E0B]", text: "RIESGO MEDIO", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "NIVEL SEGURO", bg: "bg-[#22C55E]" };
  };

  const getMovStatus = (p: number) => {
    if (p === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    if (p > 50) return { color: "text-[#EF4444]", text: "ALTA ACTIVIDAD", bg: "bg-[#EF4444]" };
    if (p > 10) return { color: "text-[#F59E0B]", text: "PRESENCIA MODERADA", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "ÁREA DESPEJADA", bg: "bg-[#22C55E]" };
  };

  const chartData = [...filteredData].reverse().map(d => ({
    time: format(parseISO(d.created_at), "HH:mm"),
    temp: d.temp,
    hum: d.hum,
    ppm: d.ppm
  }));

  // Datos para las mini-gráficas (Sparklines) de las cards
  const sparklineData = useMemo(() => {
    return data.slice(0, 20).reverse().map(d => ({
      temp: d.temp,
      hum: d.hum,
      ppm: d.ppm,
      mov: d.mov_percent
    }));
  }, [data]);

  // Componente interno para la Card con Flip
  const SensorCard = ({ title, value, unit, status, sparkKey, color }: any) => {
    const [isFlipped, setIsFlipped] = useState(false);
    
    return (
      <div 
        className="perspective-1000 h-[220px] cursor-pointer group"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
          {/* FRENTE: Gráfica Sparkline */}
          <div className="flip-card-front bg-[var(--color-surface)] p-6 border border-[var(--color-primary)]/10 shadow-lg flex flex-col justify-between overflow-hidden">
            <div className="flex justify-between items-center z-10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">{title} (Tendencia)</span>
              <div className={`w-2 h-2 rounded-full ${status.bg} shadow-[0_0_8px_currentColor]`}></div>
            </div>
            
            <div className="flex-1 mt-4 -mx-6 -mb-6 opacity-80 group-hover:opacity-100 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line 
                    type="monotone" 
                    dataKey={sparkKey} 
                    stroke={color} 
                    strokeWidth={3} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <div className="absolute bottom-4 right-6 text-[10px] font-bold text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity">
              CLIC PARA VER DATOS ➔
            </div>
          </div>

          {/* REVERSO: Datos Numéricos (Vista actual) */}
          <div className="flip-card-back bg-[var(--color-surface)] p-6 border border-[var(--color-primary)]/30 shadow-2xl flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">{title}</span>
              <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${status.bg}`}></div>
            </div>
            <div className="flex flex-col items-center justify-center flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tighter text-[var(--color-text-main)]">
                  {isOffline ? '0' : (typeof value === 'number' ? value.toFixed(1) : value)}
                </span>
                <span className="text-xl text-[var(--color-text-muted)] font-bold">{unit}</span>
              </div>
            </div>
            <div className="text-center">
              <span className={`inline-block px-4 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase bg-black/5 ${status.color}`}>
                {status.text}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render variables to handle the offline dimming effect
  const cardOpacity = isOffline ? "opacity-70 transition-all duration-1000" : "opacity-100 transition-all duration-1000";

  return (
    <div className="min-h-screen bg-[var(--color-bg-dark)] text-[var(--color-text-main)] p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header con el logo y el gradiente de la marca */}
        <div className="flex flex-col items-center mb-8 pt-4">
          <div className="relative w-24 h-24 mb-4">
            <Activity size={80} className="text-[var(--color-primary)] animate-pulse" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight uppercase" style={{
            background: 'linear-gradient(to right, var(--color-primary), var(--color-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            SAFESPACE
          </h1>
          <p className="text-[var(--color-text-muted)] mt-2 font-medium">Sistema Inteligente de Monitoreo</p>
          
          {/* Badges de estado (Offline / Online y Cronómetro) */}
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <div className={`px-6 py-2 border rounded-full flex items-center gap-3 transition-colors ${isOffline ? 'bg-red-500/10 border-red-500/30 text-red-600 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'}`}>
              {isOffline ? <WifiOff size={18} /> : <Wifi size={18} />}
              <span className="text-[15px] font-bold tracking-wide">
                {isOffline ? "DISPOSITIVO DESCONECTADO" : "SISTEMA EN LÍNEA"}
              </span>
            </div>

            {!isOffline && (
              <div className="px-6 py-2 border border-black/10 bg-white rounded-full flex items-center gap-3 shadow-sm">
                <Activity size={18} className="text-[var(--color-primary)]" />
                <span className="text-[15px] font-bold tracking-wide text-[var(--color-text-main)]">
                  PRÓXIMO REPORTE EN: <span className="text-[var(--color-primary)]">{nextReportIn}s</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-2xl p-6 shadow-xl max-w-3xl mx-auto">
          <div className="flex flex-wrap gap-4 items-end justify-center">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Desde</label>
              <input 
                type="datetime-local" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-[var(--color-bg-dark)] border border-black/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Hasta</label>
              <input 
                type="datetime-local" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-[var(--color-bg-dark)] border border-black/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
            <button 
              onClick={() => {setStartDate(""); setEndDate("");}}
              className="px-6 py-3 bg-[var(--color-surface-hover)] hover:bg-black/5 rounded-xl text-sm font-medium transition-colors shadow"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto ${cardOpacity}`}>
          <SensorCard 
            title="Temperatura" 
            value={latest.temp} 
            unit="°C" 
            status={getTempStatus(latest.temp)} 
            sparkKey="temp"
            color="#EF4444"
          />
          <SensorCard 
            title="Humedad" 
            value={latest.hum} 
            unit="% RH" 
            status={getHumStatus(latest.hum)} 
            sparkKey="hum"
            color="#3B82F6"
          />
          <SensorCard 
            title="Calidad Aire" 
            value={latest.ppm > 9999 ? '>9k' : latest.ppm} 
            unit="ppm" 
            status={getGasStatus(latest.ppm, latest.baseline_ppm)} 
            sparkKey="ppm"
            color="#10B981"
          />
          <SensorCard 
            title="Actividad" 
            value={latest.mov_percent} 
            unit="%" 
            status={getMovStatus(latest.mov_percent)} 
            sparkKey="mov"
            color="#E8832A"
          />
        </div>

        {/* Charts Section */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-3xl p-6 shadow-xl max-w-7xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-[var(--color-primary)]">
            <Activity size={24} /> Histórico de Monitoreo
          </h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                {/* Colores usando la nueva paleta de la marca para las líneas */}
                <Line type="monotone" dataKey="temp" stroke="#EF4444" strokeWidth={3} dot={false} name="Temperatura (°C)" />
                <Line type="monotone" dataKey="hum" stroke="#3B82F6" strokeWidth={3} dot={false} name="Humedad (%)" />
                <Line type="monotone" dataKey="ppm" stroke="#10B981" strokeWidth={3} dot={false} name="Gas (ppm)" />
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '12px', color: '#1A1A1A', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>


        {/* Historial de Reportes */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-3xl p-8 shadow-xl max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--color-primary)] flex items-center gap-2">
                <BellRing size={24} /> Historial de Reportes
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">Registros detallados de detección de sensores</p>
            </div>
            <div className="bg-[var(--color-bg-dark)] px-4 py-2 rounded-xl border border-black/5">
              <span className="text-sm font-bold text-[var(--color-text-muted)]">Total: {filteredData.length} registros</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/5 text-[var(--color-text-muted)] text-xs uppercase tracking-widest font-bold">
                  <th className="py-4 px-4">Fecha y Hora</th>
                  <th className="py-4 px-4">Estado</th>
                  <th className="py-4 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.length > 0 ? paginatedReports.map((report) => (
                  <tr key={report.id} className="border-b border-black/5 hover:bg-[var(--color-surface-hover)] transition-colors group">
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-[var(--color-text-main)]">{format(parseISO(report.created_at), "dd/MM/yyyy")}</span>
                        <span className="text-sm text-[var(--color-text-muted)]">{format(parseISO(report.created_at), "HH:mm:ss")}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                        report.is_emergency ? 'bg-red-500/10 text-red-600' : 
                        report.alert_level === 'warning' ? 'bg-amber-500/10 text-amber-600' : 
                        'bg-emerald-500/10 text-emerald-600'
                      }`}>
                        {report.is_emergency ? 'Emergencia' : report.alert_level === 'warning' ? 'Advertencia' : 'Normal'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button 
                        onClick={() => setSelectedReport(report)}
                        className="text-xs font-bold text-[var(--color-primary)] hover:underline uppercase tracking-widest"
                      >
                        Ver Detalles
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-[var(--color-text-muted)] italic">
                      No hay reportes que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-4 py-2 rounded-xl bg-[var(--color-bg-dark)] border border-black/5 disabled:opacity-30 font-bold text-sm transition-all hover:bg-[var(--color-surface-hover)]"
              >
                Anterior
              </button>
              <div className="flex gap-1">
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  let pageNum = i + 1;
                  if (currentPage > 3 && totalPages > 5) pageNum = currentPage - 2 + i;
                  if (pageNum > totalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${currentPage === pageNum ? 'bg-[var(--color-primary)] text-white shadow-lg' : 'bg-[var(--color-bg-dark)] border border-black/5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-4 py-2 rounded-xl bg-[var(--color-bg-dark)] border border-black/5 disabled:opacity-30 font-bold text-sm transition-all hover:bg-[var(--color-surface-hover)]"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal de Detalles del Reporte */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[var(--color-primary)] p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tight">Detalles del Reporte</h3>
                <p className="text-sm opacity-80">{format(parseISO(selectedReport.created_at), "dd MMMM yyyy, HH:mm:ss")}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="bg-black/20 hover:bg-black/40 p-2 rounded-full transition-colors">✕</button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--color-bg-dark)] p-4 rounded-2xl border border-black/5">
                  <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Temperatura</span>
                  <span className="text-2xl font-black text-[#EF4444]">{selectedReport.temp.toFixed(1)}°C</span>
                </div>
                <div className="bg-[var(--color-bg-dark)] p-4 rounded-2xl border border-black/5">
                  <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Humedad</span>
                  <span className="text-2xl font-black text-[#3B82F6]">{selectedReport.hum.toFixed(0)}%</span>
                </div>
                <div className="bg-[var(--color-bg-dark)] p-4 rounded-2xl border border-black/5">
                  <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Gas (PPM)</span>
                  <span className="text-2xl font-black text-[#10B981]">{selectedReport.ppm.toFixed(0)}</span>
                </div>
                <div className="bg-[var(--color-bg-dark)] p-4 rounded-2xl border border-black/5">
                  <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Actividad PIR</span>
                  <span className="text-2xl font-black text-[var(--color-primary)]">{selectedReport.mov_percent.toFixed(0)}%</span>
                </div>
              </div>

              <div className="bg-[var(--color-bg-dark)] p-4 rounded-2xl border border-black/5">
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Evaluación del Sistema</span>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    selectedReport.is_emergency ? 'bg-red-500' : 
                    selectedReport.alert_level === 'warning' ? 'bg-amber-500' : 
                    'bg-emerald-500'
                  }`}></div>
                  <span className="font-bold uppercase tracking-wide text-sm">
                    {selectedReport.is_emergency ? 'Detección de Emergencia Crítica' : 
                     selectedReport.alert_level === 'warning' ? 'Advertencia de Riesgo Moderado' : 
                     'Ambiente Seguro y Estable'}
                  </span>
                </div>
              </div>

              <button 
                onClick={() => setSelectedReport(null)}
                className="w-full py-4 bg-[var(--color-bg-dark)] hover:bg-[var(--color-surface-hover)] border border-black/10 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all"
              >
                Cerrar Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifier */}
      {toast.visible && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${toast.isCritical ? 'bg-red-600 border-red-500 shadow-[0_10px_40px_rgba(239,68,68,0.5)]' : 'bg-[var(--color-primary)] border-[var(--color-secondary)] shadow-[0_10px_40px_rgba(232,131,42,0.3)]'} border text-white px-6 py-4 rounded-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300`}>
          <BellRing className={`animate-bounce ${toast.isCritical ? 'text-white' : 'text-white'}`} />
          <div>
            <h4 className="font-bold text-lg">{toast.title}</h4>
            <p className="text-sm opacity-90">{toast.message}</p>
          </div>
          <button onClick={() => setToast(prev => ({...prev, visible: false}))} className="ml-4 p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}
