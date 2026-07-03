import { useState, useEffect, useRef } from 'react';
import './App.css';

const GROQ_API_KEY = "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";
const GROQ_API_URL = "http://localhost:3001/api/chat";

const SYSTEM_PROMPT = `Eres AgroDetección, un sistema experto en fitopatología, agronomía y diagnóstico vegetal. Tu audiencia incluye tanto agricultores profesionales como personas con plantas en casa, por lo que debes adaptar tu lenguaje: técnico y preciso, pero siempre comprensible.

Responde SIEMPRE en español.

---

CUANDO TE ENVÍEN UNA IMAGEN DE UNA PLANTA, realiza un informe de diagnóstico completo con la siguiente estructura obligatoria:

🌿 IDENTIFICACIÓN
- Especie o tipo de planta (si es identificable)
- Parte de la planta afectada (hoja, tallo, raíz, fruto, etc.)
- Estado general observado

🔬 DIAGNÓSTICO PRINCIPAL
- Nombre del problema detectado (enfermedad, plaga, deficiencia o condición)
- Nombre científico si aplica
- Nivel de severidad: Leve / Moderado / Severo
- Descripción de los síntomas visibles que llevaron a ese diagnóstico

⚠️ CAUSAS PROBABLES
- Agente causal (hongo, bacteria, virus, insecto, condición ambiental, deficiencia nutricional, etc.)
- Factores que favorecen su aparición (humedad, temperatura, riego excesivo, suelo, etc.)

💊 TRATAMIENTO RECOMENDADO
- Medidas inmediatas (qué hacer hoy)
- Tratamiento biológico o natural (si existe)
- Tratamiento químico si es necesario (nombre genérico del producto o ingrediente activo)
- Dosis o frecuencia de aplicación aproximada

🛡️ PREVENCIÓN
- Cómo evitar que vuelva a ocurrir
- Buenas prácticas de manejo para esa planta

📋 OBSERVACIONES ADICIONALES
- Cualquier otro problema secundario visible
- Recomendación de seguimiento si el caso es severo

---

CUANDO EL USUARIO HAGA PREGUNTAS SIN IMAGEN, responde de forma clara, estructurada y práctica. Si la pregunta es técnica, usa terminología agronómica correcta. Si parece ser un usuario de casa, simplifica sin perder precisión.

Nunca inventes diagnósticos si la imagen no es clara — en ese caso indícalo honestamente y pide una foto más detallada de la zona afectada.`;

function renderMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*?)$/gm, '<strong style="font-size:15px;display:block;margin:8px 0 4px">$1</strong>')
    .replace(/^## (.*?)$/gm, '<strong style="font-size:16px;display:block;margin:8px 0 4px">$1</strong>')
    .replace(/^# (.*?)$/gm, '<strong style="font-size:17px;display:block;margin:8px 0 4px">$1</strong>')
    .replace(/^\d+\.\s(.*?)$/gm, '<span style="display:block;margin:4px 0;padding-left:4px">• $1</span>')
    .replace(/^[-*]\s(.*?)$/gm, '<span style="display:block;margin:4px 0;padding-left:4px">• $1</span>')
    .replace(/\n/g, '<br/>');
}

export default function App() {
  const [sidebarAbierta, setSidebarAbierta] = useState(true);
  const [chatActivoId, setChatActivoId] = useState(null);
  const [input, setInput] = useState("");
  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenBase64, setImagenBase64] = useState(null);
  const [estaPensando, setEstaPensando] = useState(false);
  const [historialChats, setHistorialChats] = useState(() => {
    try {
      const guardado = localStorage.getItem("agrodeteccion_historial");
      return guardado ? JSON.parse(guardado) : [];
    } catch {
      return [];
    }
  });

  const finMensajesRef = useRef(null);
  const inputFileRef = useRef(null);

  const chatActual = historialChats.find(c => c.id === chatActivoId);
  const cantidadMensajes = chatActual?.mensajes?.length ?? 0;

  // ✅ Guardar historial en localStorage cada vez que cambie
  useEffect(() => {
    try {
      localStorage.setItem("agrodeteccion_historial", JSON.stringify(historialChats));
    } catch {
      console.error("Error al guardar historial");
    }
  }, [historialChats]);

  // ✅ Solo hace scroll cuando hay un chat activo y cambia la cantidad de mensajes
  useEffect(() => {
    if (!chatActivoId) return;
    finMensajesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatActivoId, estaPensando, cantidadMensajes]);

  const manejarImagen = (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultado = ev.target.result;
      setImagenPreview(resultado);
      setImagenBase64(resultado.split(',')[1]);
    };
    reader.readAsDataURL(archivo);
  };

  const limpiarImagen = () => {
    setImagenPreview(null);
    setImagenBase64(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  };

  const llamarGroq = async (mensajes, imagenB64 = null) => {
    const mensajesPrevios = mensajes.slice(0, -1);
    const historialTexto = mensajesPrevios.length > 0
      ? `HISTORIAL DE LA CONVERSACIÓN ACTUAL:\n${mensajesPrevios.map(m =>
          `${m.esIA ? "AgroDetección" : "Usuario"}: ${m.texto}`
        ).join("\n")}\n\n---\n\n`
      : "";

    const systemPromptConHistorial = historialTexto + SYSTEM_PROMPT;

    const mensajesParaAPI = [
      { role: "system", content: systemPromptConHistorial },
      ...mensajesPrevios.map(m => ({
        role: m.esIA ? "assistant" : "user",
        content: m.texto
      }))
    ];

    const ultimoMsg = mensajes[mensajes.length - 1];
    if (imagenB64) {
      mensajesParaAPI.push({
        role: "user",
        content: [
          { type: "text", text: ultimoMsg.texto || "Analiza esta imagen de la planta." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imagenB64}` } }
        ]
      });
    } else {
      mensajesParaAPI.push({ role: "user", content: ultimoMsg.texto });
    }

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: imagenB64 ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
        messages: mensajesParaAPI,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || "Error al llamar a Groq");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No obtuve respuesta.";
  };

  const iniciarChatDesdeIndex = async (e) => {
    e.preventDefault();
    if (!input.trim() && !imagenBase64) return;

    const textoInicial = input || "Analiza esta imagen";
    const imgB64 = imagenBase64;
    const imgPreview = imagenPreview;
    const nuevoId = Date.now();
    const mensajeUsuario = { id: Date.now(), texto: textoInicial, esIA: false, imagen: imgPreview };
    const nuevoChat = {
      id: nuevoId,
      titulo: textoInicial.length > 20 ? textoInicial.substring(0, 20) + "..." : textoInicial,
      mensajes: [mensajeUsuario]
    };

    setHistorialChats(prev => [nuevoChat, ...prev]);
    setChatActivoId(nuevoId);
    setInput("");
    limpiarImagen();
    setEstaPensando(true);

    try {
      const respuestaTexto = await llamarGroq([mensajeUsuario], imgB64);
      const mensajeIA = { id: Date.now() + 1, texto: respuestaTexto, esIA: true };
      setHistorialChats(prev => prev.map(c => c.id === nuevoId
        ? { ...c, mensajes: [...c.mensajes, mensajeIA] } : c
      ));
    } catch (error) {
      console.error("Error:", error);
      setHistorialChats(prev => prev.map(c => c.id === nuevoId
        ? { ...c, mensajes: [...c.mensajes, { id: Date.now() + 1, texto: "Hubo un error. Intenta de nuevo.", esIA: true }] } : c
      ));
    } finally {
      setEstaPensando(false);
    }
  };

  const manejarEnvioChat = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !imagenBase64) || estaPensando) return;

    const textoUsuario = input || "Analiza esta imagen";
    const imgB64 = imagenBase64;
    const imgPreview = imagenPreview;
    setInput("");
    limpiarImagen();

    const mensajeUsuario = { id: Date.now(), texto: textoUsuario, esIA: false, imagen: imgPreview };
    const chatActualData = historialChats.find(c => c.id === chatActivoId);
    const mensajesActualizados = [...(chatActualData?.mensajes || []), mensajeUsuario];

    setHistorialChats(prev => prev.map(c =>
      c.id === chatActivoId ? { ...c, mensajes: mensajesActualizados } : c
    ));

    setEstaPensando(true);

    try {
      const respuestaTexto = await llamarGroq(mensajesActualizados, imgB64);
      const mensajeIA = { id: Date.now() + 1, texto: respuestaTexto, esIA: true };
      setHistorialChats(prev => prev.map(c => c.id === chatActivoId
        ? { ...c, mensajes: [...c.mensajes, mensajeIA] } : c
      ));
    } catch (error) {
      console.error("Error:", error);
      setHistorialChats(prev => prev.map(c => c.id === chatActivoId
        ? { ...c, mensajes: [...c.mensajes, { id: Date.now() + 1, texto: "Hubo un error. Intenta de nuevo.", esIA: true }] } : c
      ));
    } finally {
      setEstaPensando(false);
    }
  };

  return (
    <div style={{
      display: 'flex', width: '100%', height: '100%',
      backgroundColor: '#f1f4f1',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(225,235,223,0.6) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(243,247,242,0.8) 0px, transparent 50%)',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>

      <input type="file" accept="image/*" ref={inputFileRef} onChange={manejarImagen} style={{ display: 'none' }} />

      {/* SIDEBAR */}
      <div className="sidebar-scroll" style={{
        width: sidebarAbierta ? '280px' : '0px',
        backgroundColor: '#1a1d24', color: '#ececed',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
        overflow: 'hidden',
        boxShadow: sidebarAbierta ? '10px 0 40px rgba(0,0,0,0.08)' : 'none',
        zIndex: 10, flexShrink: 0
      }}>
        <div style={{ padding: '30px 24px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(46,125,50,0.3)'
            }}>
              <span style={{ fontSize: '16px' }}>🌱</span>
            </div>
            <h2 style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '2px', color: '#fff', margin: 0 }}>AGRODETECCIÓN</h2>
          </div>
          <p style={{ fontSize: '11px', color: '#627282', margin: '8px 0 0 44px', fontStyle: 'italic' }}>Historial de consultas</p>
        </div>

        <div style={{ flex: 1, padding: '20px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {historialChats.length === 0 ? (
            <p style={{ color: '#4a5560', fontSize: '13px', textAlign: 'center', marginTop: '20px', fontStyle: 'italic' }}>No hay consultas recientes</p>
          ) : (
            historialChats.map(chat => (
              <div key={chat.id} className="sidebar-item"
                onClick={() => setChatActivoId(chat.id)}
                style={{
                  padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                  background: chatActivoId === chat.id ? 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)' : 'transparent',
                  color: chatActivoId === chat.id ? '#66bb6a' : '#94a3b8',
                  fontSize: '13px', fontWeight: chatActivoId === chat.id ? '600' : '400',
                  border: '1px solid', borderColor: chatActivoId === chat.id ? 'rgba(102,187,106,0.15)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}
              >
                <span style={{ opacity: chatActivoId === chat.id ? 1 : 0.6 }}>🌿</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.titulo}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          <button className="btn-nueva-consulta" onClick={() => { setChatActivoId(null); limpiarImagen(); }}>
            + Nueva Consulta
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>

        {/* HEADER */}
        <div style={{
          height: '55px', background: 'linear-gradient(90deg, #2e7d32 0%, #1b5e20 100%)',
          width: '100%', display: 'flex', alignItems: 'center', padding: '0 24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', zIndex: 5, flexShrink: 0
        }}>
          <button className="btn-toggle-sidebar" onClick={() => setSidebarAbierta(!sidebarAbierta)}>☰</button>
        </div>

        {/* PANTALLA DE INICIO */}
        {chatActivoId === null ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div className="card-glass animacion-fade" style={{
              width: '100%', height: '100%', borderRadius: '0',
              padding: '60px 80px', textAlign: 'center', boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
            }}>
              <h1 style={{ color: '#1a1d24', fontSize: '38px', fontWeight: '800', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
                AgroDetección <span style={{ background: 'linear-gradient(135deg, #388e3c, #66bb6a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '300' }}>Práctica</span>
              </h1>
              <p style={{ color: '#4caf50', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '2.5px', margin: '0 0 30px 0' }}>Hola, Usuario</p>
              <h2 style={{ color: '#334155', fontSize: '23px', marginBottom: '45px', fontWeight: '500', lineHeight: '1.4' }}>¿Deseas realizar una consulta para tus plantas?</h2>

              {imagenPreview && (
                <div style={{ marginBottom: '16px', position: 'relative', display: 'inline-block' }}>
                  <img src={imagenPreview} alt="preview" style={{ maxHeight: '140px', maxWidth: '100%', borderRadius: '12px', border: '2px solid #4caf50', objectFit: 'cover' }} />
                  <button onClick={limpiarImagen} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}

              <form onSubmit={iniciarChatDesdeIndex} style={{
                display: 'flex', alignItems: 'center',
                background: 'linear-gradient(135deg, #444c3e 0%, #353b30 100%)',
                padding: '8px 10px 8px 16px', borderRadius: '40px',
                boxShadow: '0 12px 35px rgba(53,59,48,0.25)',
                border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); inputFileRef.current.click(); }} style={{
                  background: 'transparent', border: 'none', color: '#a0b0a0',
                  fontSize: '20px', cursor: 'pointer', padding: '4px 8px 4px 4px',
                  display: 'flex', alignItems: 'center', flexShrink: 0
                }} title="Adjuntar imagen">📎</button>

                <input type="text" placeholder="Pregúntale al experto en plantas..." value={input}
                  onChange={(e) => setInput(e.target.value)}
                  style={{ flex: 1, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: '15px', color: '#fff', paddingRight: '12px' }}
                />
                <button type="submit" disabled={!input.trim() && !imagenBase64} style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #66bb6a 0%, #2e7d32 100%)',
                  color: '#fff', border: 'none', cursor: 'pointer', fontSize: '18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 15px rgba(46,125,50,0.4)', flexShrink: 0
                }}>➔</button>
              </form>
            </div>
          </div>

        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px 24px 0 24px' }}>
            <div className="animacion-fade" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '15px', flexShrink: 0 }}>
                <h3 style={{ color: '#2e7d32', margin: 0, fontWeight: '600', fontSize: '16px' }}>Consulta en Progreso</h3>
                <button onClick={() => { setChatActivoId(null); limpiarImagen(); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>✕ Cerrar Chat</button>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
                {chatActual?.mensajes.map((msg) => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.esIA ? 'flex-start' : 'flex-end' }}>
                    <div style={{
                      maxWidth: '75%', padding: '14px 20px',
                      borderRadius: msg.esIA ? '20px 20px 20px 4px' : '20px 20px 4px 20px',
                      fontSize: '15px', lineHeight: '1.6',
                      background: msg.esIA ? '#fff' : 'linear-gradient(135deg, #388e3c 0%, #2e7d32 100%)',
                      color: msg.esIA ? '#334155' : '#fff',
                      boxShadow: msg.esIA ? '0 4px 15px rgba(0,0,0,0.04)' : '0 6px 15px rgba(46,125,50,0.15)',
                      border: msg.esIA ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      textAlign: 'left'
                    }}>
                      {msg.imagen && (
                        <img src={msg.imagen} alt="adjunto" style={{ maxWidth: '220px', maxHeight: '160px', borderRadius: '10px', objectFit: 'cover', display: 'block', marginBottom: '8px' }} />
                      )}
                      {msg.esIA
                        ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.texto) }} />
                        : msg.texto
                      }
                    </div>
                  </div>
                ))}

                {estaPensando && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{
                      padding: '14px 20px', borderRadius: '20px 20px 20px 4px',
                      background: '#fff', border: '1px solid rgba(0,0,0,0.04)',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.04)',
                      display: 'flex', gap: '6px', alignItems: 'center'
                    }}>
                      {[0, 0.2, 0.4].map((delay, i) => (
                        <span key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50', display: 'inline-block', animation: `bounce 1.2s ${delay}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={finMensajesRef} />
              </div>

              <div style={{ flexShrink: 0, padding: '16px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                {imagenPreview && (
                  <div style={{ marginBottom: '10px', position: 'relative', display: 'inline-block' }}>
                    <img src={imagenPreview} alt="preview" style={{ maxHeight: '100px', maxWidth: '160px', borderRadius: '10px', border: '2px solid #4caf50', objectFit: 'cover' }} />
                    <button onClick={limpiarImagen} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                )}
                <form onSubmit={manejarEnvioChat} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); inputFileRef.current.click(); }} style={{
                    background: '#fff', border: '1px solid rgba(0,0,0,0.1)', color: '#4caf50',
                    width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer',
                    fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                  }} title="Adjuntar imagen">📎</button>

                  <input type="text" placeholder="Escribe tu mensaje sobre tus cultivos..." value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={estaPensando}
                    style={{
                      flex: 1, padding: '14px 22px', borderRadius: '25px',
                      border: '1px solid rgba(0,0,0,0.1)', outline: 'none', fontSize: '14px',
                      backgroundColor: '#fff', color: '#334155',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)'
                    }}
                  />
                  <button type="submit" disabled={estaPensando || (!input.trim() && !imagenBase64)} style={{
                    padding: '0 24px', height: '48px', borderRadius: '25px',
                    background: estaPensando ? '#94a3b8' : 'linear-gradient(135deg, #388e3c 0%, #2e7d32 100%)',
                    color: '#fff', border: 'none', fontWeight: '600',
                    cursor: estaPensando ? 'not-allowed' : 'pointer', fontSize: '14px',
                    boxShadow: '0 4px 15px rgba(46,125,50,0.2)', flexShrink: 0
                  }}>
                    {estaPensando ? 'Procesando...' : 'Enviar'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
