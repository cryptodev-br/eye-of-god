require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Inicializar aplicação Express
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base de dados em arquivo
const DB_PATH = path.join(__dirname, 'db.json');

// Inicializar banco de dados se não existir
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ links: {}, traces: {} }));
}

// Funções auxiliares
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Função para obter o IP real do cliente
function getRealIP(req) {
  // Ordem de prioridade para headers que contêm o IP real
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip', // Cloudflare
    'true-client-ip',   // Akamai
    'x-client-ip',
    'forwarded',
  ];
  
  for (const header of headers) {
    const value = req.headers[header];
    if (value) {
      // Muitos desses headers podem conter múltiplos IPs separados por vírgula
      // O primeiro IP normalmente é o do cliente real
      const ips = value.split(',').map(ip => ip.trim());
      if (ips[0]) {
        return ips[0];
      }
    }
  }
  
  // Se não encontrar em nenhum header, use o IP padrão da requisição
  return req.ip;
}

// Obter informações do IP
async function getIPInfo(ip) {
  try {
    // Limpar o IP para remover o prefixo IPv6
    let cleanIp = ip;
    if (ip.includes('::ffff:')) {
      cleanIp = ip.replace('::ffff:', '');
    }
    
    // Se for localhost ou IP privado, usamos um IP público para simulação
    if (cleanIp === '::1' || cleanIp === '127.0.0.1' || 
        cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || 
        cleanIp.startsWith('172.16.') || cleanIp.startsWith('172.17.') || 
        cleanIp.startsWith('172.18.') || cleanIp.startsWith('172.19.') || 
        cleanIp.startsWith('172.2') || cleanIp.startsWith('172.3') || 
        cleanIp.startsWith('169.254.')) {
      return {
        ip: cleanIp,
        location: 'Local (Simulado)',
        isp: 'Local Network',
        asn: 'N/A',
        org: 'Local Network',
        coordinates: null
      };
    }
    
    // API #0: Tentar obter coordenadas diretas via abstractapi.com
    try {
      const apiKey = process.env.ABSTRACTAPI_KEY || ''; // Recomendável adicionar no .env
      if (apiKey) {
        const response = await fetch(`https://ipgeolocation.abstractapi.com/v1/?api_key=${apiKey}&ip_address=${cleanIp}`);
        const data = await response.json();
        
        if (data && data.latitude && data.longitude) {
          return {
            ip: cleanIp,
            location: `${data.city || ''}, ${data.region || ''}, ${data.country || ''}`.replace(', ,', ','),
            isp: data.connection.isp || 'Desconhecido',
            asn: data.connection.autonomous_system_number || 'Desconhecido',
            org: data.connection.autonomous_system_organization || 'Desconhecido',
            coordinates: {
              latitude: data.latitude,
              longitude: data.longitude,
              accuracy: 'alta'
            },
            // Dados extras
            timezone: data.timezone ? data.timezone.name : null,
            currency: data.currency ? data.currency.currency_name : null,
            continent: data.continent || null
          };
        }
      }
    } catch (error) {
      console.log('Falha na API de geolocalização direta:', error.message);
    }
    
    // Tentar primeira API: ipapi.co
    try {
      const response = await fetch(`https://ipapi.co/${cleanIp}/json/`);
      const data = await response.json();
      
      if (!data.error && data.city && data.country_name) {
        return {
          ip: cleanIp,
          location: `${data.city || ''}, ${data.region || ''}, ${data.country_name || ''}`.replace(', ,', ','),
          isp: data.org || 'Desconhecido',
          asn: data.asn || 'Desconhecido',
          org: data.org || 'Desconhecido',
          coordinates: data.latitude && data.longitude ? {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: 'média'
          } : null,
          timezone: data.timezone || null,
          currency: data.currency || null
        };
      }
    } catch (error) {
      console.log('Falha na primeira API de geolocalização:', error.message);
    }
    
    // Tentar segunda API: ipinfo.io
    try {
      const response = await fetch(`https://ipinfo.io/${cleanIp}/json`);
      const data = await response.json();
      
      if (data && !data.error && data.city && data.country) {
        // ipinfo.io retorna coordenadas como "lat,lon"
        let coordinates = null;
        if (data.loc) {
          const [latitude, longitude] = data.loc.split(',');
          if (latitude && longitude) {
            coordinates = {
              latitude: parseFloat(latitude),
              longitude: parseFloat(longitude),
              accuracy: 'média'
            };
          }
        }
        
        return {
          ip: cleanIp,
          location: `${data.city || ''}, ${data.region || ''}, ${data.country || ''}`.replace(', ,', ','),
          isp: data.org || 'Desconhecido',
          asn: data.org ? data.org.split(' ')[0] : 'Desconhecido',
          org: data.org ? data.org.split(' ').slice(1).join(' ') : 'Desconhecido',
          coordinates: coordinates,
          timezone: data.timezone || null
        };
      }
    } catch (error) {
      console.log('Falha na segunda API de geolocalização:', error.message);
    }
    
    // Tentar terceira API: ip-api.com (HTTP apenas, use com cautela)
    try {
      const response = await fetch(`http://ip-api.com/json/${cleanIp}`);
      const data = await response.json();
      
      if (data && data.status === 'success') {
        return {
          ip: cleanIp,
          location: `${data.city || ''}, ${data.regionName || ''}, ${data.country || ''}`.replace(', ,', ','),
          isp: data.isp || 'Desconhecido',
          asn: data.as || 'Desconhecido',
          org: data.org || 'Desconhecido',
          coordinates: data.lat && data.lon ? {
            latitude: data.lat,
            longitude: data.lon,
            accuracy: 'média'
          } : null,
          timezone: data.timezone || null
        };
      }
    } catch (error) {
      console.log('Falha na terceira API de geolocalização:', error.message);
    }
    
    // Tentar quarta API: geolocation-db.com (opção de backup)
    try {
      const response = await fetch(`https://geolocation-db.com/json/${cleanIp}`);
      const data = await response.json();
      
      if (data && data.country_name) {
        return {
          ip: cleanIp,
          location: `${data.city || ''}, ${data.state || ''}, ${data.country_name || ''}`.replace(', ,', ','),
          isp: 'Desconhecido',
          asn: 'Desconhecido',
          org: 'Desconhecido',
          coordinates: data.latitude && data.longitude ? {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: 'baixa'
          } : null
        };
      }
    } catch (error) {
      console.log('Falha na quarta API de geolocalização:', error.message);
    }
    
    // Se todas as APIs falharem, use dados básicos baseados no país pelo código IP
    // Esta é uma solução de último recurso usando dados locais
    try {
      // Identificar país pelo primeiro octeto do IP (muito básico)
      const ipFirstOctet = parseInt(cleanIp.split('.')[0]);
      let location = 'Desconhecido';
      let coordinates = null;
      
      // Mapeamento muito básico de alguns intervalos comuns
      if (ipFirstOctet >= 186 && ipFirstOctet <= 189) {
        location = 'Brasil';
        coordinates = {
          latitude: -15.7801, // Coordenadas aproximadas do centro do Brasil
          longitude: -47.9292,
          accuracy: 'muito baixa'
        };
      } else if (ipFirstOctet >= 72 && ipFirstOctet <= 79) {
        location = 'Estados Unidos';
        coordinates = {
          latitude: 37.0902,  // Coordenadas aproximadas do centro dos EUA
          longitude: -95.7129,
          accuracy: 'muito baixa'
        };
      } else if (ipFirstOctet >= 81 && ipFirstOctet <= 91) {
        location = 'Europa';
        coordinates = {
          latitude: 48.8566,  // Coordenadas aproximadas do centro da Europa
          longitude: 2.3522,
          accuracy: 'muito baixa'
        };
      }
      
      return {
        ip: cleanIp,
        location: location !== 'Desconhecido' ? location : 'Localização não identificada',
        isp: 'Desconhecido',
        asn: 'Desconhecido',
        org: 'Desconhecido',
        coordinates: coordinates
      };
    } catch (e) {
      // Se até isso falhar, retorne desconhecido
      return {
        ip: cleanIp,
        location: 'Localização não identificada',
        isp: 'Desconhecido',
        asn: 'Desconhecido',
        org: 'Desconhecido',
        coordinates: null
      };
    }
  } catch (error) {
    console.error('Erro ao obter informações do IP:', error);
    return {
      ip: ip,
      location: 'Erro na obtenção de dados',
      isp: 'Desconhecido',
      asn: 'Desconhecido',
      org: 'Desconhecido',
      coordinates: null
    };
  }
}

// Rotas
// Gerar novo link
app.post('/api/generate-link', async (req, res) => {
  const { targetUrl } = req.body;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'URL de destino é necessária' });
  }
  
  // Gerar um ID único para este link
  const linkId = uuidv4();
  const db = readDB();
  
  // Armazenar informações do link
  db.links[linkId] = {
    id: linkId,
    targetUrl,
    createdAt: new Date().toISOString(),
    createdBy: getRealIP(req)
  };
  
  // Inicializar o histórico de rastreamento para este link
  db.traces[linkId] = [];
  
  writeDB(db);
  
  // Retornar o link de rastreamento
  const host = isProduction ? req.headers.host : `${req.headers.host}`;
  const trackingLink = `${req.protocol}://${host}/t/${linkId}`;
  
  res.json({
    success: true,
    linkId,
    trackingLink,
    shortLink: trackingLink,
    originalUrl: targetUrl
  });
});

// Redirecionamento e rastreamento
app.get('/t/:linkId', async (req, res) => {
  const { linkId } = req.params;
  const db = readDB();
  
  // Verificar se o link existe
  if (!db.links[linkId]) {
    return res.status(404).send('Link não encontrado');
  }
  
  // Coletar informações de rastreamento
  const userAgent = req.get('User-Agent');
  const realIP = getRealIP(req);
  const ipInfo = await getIPInfo(realIP);
  const timestamp = new Date().toISOString();
  
  // Criar ID único para este acesso
  const accessId = uuidv4();
  
  // Adicionar à lista de rastreamentos
  db.traces[linkId].push({
    timestamp,
    ip: realIP,
    ipInfo,
    userAgent,
    referer: req.get('Referer') || 'Direto',
    accessId, // ID único para este acesso
    preciseLocation: null // Será atualizado se o usuário permitir geolocalização
  });
  
  writeDB(db);
  
  // Em vez de redirecionar diretamente, mostrar uma página intermediária que solicita permissão de localização
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecionando...</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f8f9fa;
        color: #333;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        padding: 20px;
        text-align: center;
      }
      .container {
        max-width: 600px;
        background-color: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.05);
      }
      h1 {
        color: #2c3e50;
        margin-top: 0;
      }
      p {
        line-height: 1.6;
        margin-bottom: 20px;
      }
      .redirect-button {
        background-color: #3498db;
        color: white;
        border: none;
        padding: 12px 25px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 500;
        transition: background-color 0.2s;
        text-decoration: none;
        display: inline-block;
      }
      .redirect-button:hover {
        background-color: #2980b9;
      }
      .loader {
        border: 5px solid #f3f3f3;
        border-top: 5px solid #3498db;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
        margin: 20px auto;
        display: none;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .privacy-notice {
        font-size: 0.8em;
        color: #7f8c8d;
        margin-top: 20px;
      }
      .skip-link {
        display: block;
        margin-top: 15px;
        color: #7f8c8d;
        text-decoration: underline;
        font-size: 0.9em;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Você será redirecionado</h1>
      <p>Você está prestes a ser redirecionado para o link de destino.</p>
      
      <div id="loader" class="loader"></div>
      
      <button id="redirectButton" class="redirect-button">Continuar para o destino</button>
      <a href="#" id="skipLink" class="skip-link">Pular verificação de localização</a>
      
      <p class="privacy-notice">Para melhorar nosso serviço de rastreamento, podemos solicitar sua localização atual com maior precisão. Isto é opcional e você pode pular esta etapa.</p>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const redirectButton = document.getElementById('redirectButton');
        const skipLink = document.getElementById('skipLink');
        const loader = document.getElementById('loader');
        const accessId = '${accessId}';
        const linkId = '${linkId}';
        const targetUrl = '${db.links[linkId].targetUrl}';
        
        redirectButton.addEventListener('click', function() {
          loader.style.display = 'block';
          redirectButton.style.display = 'none';
          skipLink.style.display = 'none';
          
          // Tentar obter a localização precisa
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              // Sucesso
              function(position) {
                const preciseLocation = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  altitude: position.coords.altitude,
                  altitudeAccuracy: position.coords.altitudeAccuracy,
                  heading: position.coords.heading,
                  speed: position.coords.speed,
                  timestamp: position.timestamp
                };
                
                // Enviar localização para o servidor
                fetch('/api/update-location', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    linkId,
                    accessId,
                    preciseLocation
                  })
                })
                .finally(() => {
                  // Redirecionar para o destino após 1 segundo
                  setTimeout(() => {
                    window.location.href = targetUrl;
                  }, 1000);
                });
              },
              // Erro
              function(error) {
                console.log('Erro ao obter localização:', error.message);
                // Redirecionar para o destino
                window.location.href = targetUrl;
              },
              // Opções
              {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
              }
            );
          } else {
            // Navegador não suporta geolocalização
            window.location.href = targetUrl;
          }
        });
        
        skipLink.addEventListener('click', function(e) {
          e.preventDefault();
          window.location.href = targetUrl;
        });
      });
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Nova rota para atualizar a localização precisa
app.post('/api/update-location', (req, res) => {
  const { linkId, accessId, preciseLocation } = req.body;
  
  if (!linkId || !accessId || !preciseLocation) {
    return res.status(400).json({ error: 'Parâmetros incompletos' });
  }
  
  try {
    const db = readDB();
    
    // Verificar se o link existe
    if (!db.links[linkId]) {
      return res.status(404).json({ error: 'Link não encontrado' });
    }
    
    // Encontrar o acesso específico e atualizar a localização
    const accessIndex = db.traces[linkId].findIndex(trace => trace.accessId === accessId);
    
    if (accessIndex !== -1) {
      db.traces[linkId][accessIndex].preciseLocation = preciseLocation;
      
      // Também podemos obter informações adicionais usando as coordenadas
      if (preciseLocation.latitude && preciseLocation.longitude) {
        // Iniciar uma tarefa em background para obter detalhes do local
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${preciseLocation.latitude}&lon=${preciseLocation.longitude}&zoom=18&addressdetails=1`)
          .then(response => response.json())
          .then(data => {
            if (data && data.address) {
              db.traces[linkId][accessIndex].addressDetails = {
                road: data.address.road || null,
                house_number: data.address.house_number || null,
                neighbourhood: data.address.neighbourhood || data.address.suburb || null,
                city: data.address.city || data.address.town || data.address.village || null,
                state: data.address.state || null,
                country: data.address.country || null,
                postcode: data.address.postcode || null,
                formatted: data.display_name || null
              };
              
              writeDB(db);
            }
          })
          .catch(err => {
            console.error('Erro ao obter detalhes do endereço:', err);
          });
      }
      
      writeDB(db);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar localização:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Obter informações de rastreamento de um link
app.get('/api/track/:linkId', (req, res) => {
  const { linkId } = req.params;
  const db = readDB();
  
  // Verificar se o link existe
  if (!db.links[linkId]) {
    return res.status(404).json({ error: 'Link não encontrado' });
  }
  
  // Retornar informações do link e seu histórico de rastreamento
  res.json({
    link: db.links[linkId],
    traces: db.traces[linkId] || []
  });
});

// Página de informações do link
app.get('/info/:linkId', (req, res) => {
  const { linkId } = req.params;
  const db = readDB();
  
  // Verificar se o link existe
  if (!db.links[linkId]) {
    return res.status(404).send('Link não encontrado');
  }
  
  // Construir HTML para exibir informações
  const link = db.links[linkId];
  const traces = db.traces[linkId] || [];
  
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eye of God - Rastreamento de Link</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 20px;
        color: #333;
        background-color: #f8f9fa;
      }
      .container {
        max-width: 1000px;
        margin: 0 auto;
        background: white;
        padding: 25px;
        border-radius: 8px;
        box-shadow: 0 0 20px rgba(0,0,0,0.05);
      }
      h1 {
        color: #2c3e50;
        border-bottom: 2px solid #3498db;
        padding-bottom: 15px;
        margin-bottom: 25px;
      }
      .link-info {
        background-color: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 30px;
        border-left: 4px solid #3498db;
      }
      .trace-item {
        border-left: 4px solid #3498db;
        padding: 15px;
        margin-bottom: 20px;
        background-color: #f8f9fa;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        transition: transform 0.2s;
      }
      .trace-item:hover {
        transform: translateY(-3px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
      .trace-time {
        color: #7f8c8d;
        font-size: 0.9em;
        margin-bottom: 10px;
      }
      .trace-details {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
      }
      .trace-details-col {
        flex: 1;
        min-width: 250px;
      }
      .trace-details p {
        margin: 8px 0;
      }
      .no-traces {
        color: #95a5a6;
        font-style: italic;
        padding: 20px;
        text-align: center;
        background: #f8f9fa;
        border-radius: 8px;
      }
      .back-button {
        display: inline-block;
        margin-top: 20px;
        background-color: #3498db;
        color: white;
        padding: 12px 20px;
        text-decoration: none;
        border-radius: 5px;
        font-weight: 500;
        transition: background-color 0.2s;
      }
      .back-button:hover {
        background-color: #2980b9;
      }
      .stats {
        background-color: #2c3e50;
        color: white;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 25px;
        display: flex;
        justify-content: space-around;
        text-align: center;
      }
      .stat-item {
        padding: 0 10px;
      }
      .stat-value {
        font-size: 1.8em;
        font-weight: bold;
        display: block;
        margin-bottom: 5px;
      }
      .stat-label {
        font-size: 0.9em;
        opacity: 0.8;
      }
      .map-container {
        height: 250px;
        margin-top: 15px;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      }
      @media (max-width: 768px) {
        .container {
          padding: 15px;
        }
        .stats {
          flex-direction: column;
          gap: 10px;
        }
      }
      .qr-code {
        text-align: center;
        margin: 20px 0;
      }
      .copy-link {
        background: #eee;
        padding: 10px;
        border-radius: 5px;
        font-family: monospace;
        display: flex;
        align-items: center;
        margin: 15px 0;
      }
      .copy-link input {
        flex: 1;
        border: none;
        background: transparent;
        padding: 5px;
      }
      .copy-btn {
        background: #3498db;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
      }
      .device-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .device-icon {
        font-size: 1.5em;
      }
      .no-map-info {
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
        margin-top: 15px;
        color: #7f8c8d;
        font-style: italic;
      }
      .accuracy-badge {
        font-size: 0.8em;
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 5px;
        display: inline-block;
      }
      .accuracy-badge.alta {
        background-color: #27ae60;
        color: white;
      }
      .accuracy-badge.média {
        background-color: #f39c12;
        color: white;
      }
      .accuracy-badge.baixa {
        background-color: #e74c3c;
        color: white;
      }
      .accuracy-badge.muito.baixa {
        background-color: #95a5a6;
        color: white;
      }
      .precise-location {
        background-color: #e8f6ff;
        padding: 10px;
        border-radius: 6px;
        margin: 10px 0;
        border-left: 4px solid #27ae60;
      }
      .precise-location p {
        margin: 5px 0;
      }
      .stats-box {
        margin-top: 10px;
        margin-bottom: 15px;
        padding: 10px;
        background-color: #f8f9fa;
        border-radius: 6px;
        font-size: 0.9em;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Rastreamento de Link</h1>
      
      <div class="link-info">
        <h2>Informações do Link</h2>
        <p><strong>Link de rastreamento:</strong></p>
        <div class="copy-link">
          <input type="text" readonly value="${req.protocol}://${req.get('host')}/t/${linkId}" id="trackingLink">
          <button class="copy-btn" onclick="copyLink()">Copiar</button>
        </div>
        <p><strong>URL de destino:</strong> ${link.targetUrl}</p>
        <p><strong>Criado em:</strong> ${new Date(link.createdAt).toLocaleString('pt-BR')}</p>
        
        <div class="qr-code">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${req.protocol}://${req.get('host')}/t/${linkId}`)}" alt="QR Code do link">
          <p>Escaneie este QR Code para acessar o link</p>
        </div>
      </div>
      
      <div class="stats">
        <div class="stat-item">
          <span class="stat-value">${traces.length}</span>
          <span class="stat-label">Total de Acessos</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${traces.length > 0 ? new Date(traces[traces.length - 1].timestamp).toLocaleDateString('pt-BR') : '-'}</span>
          <span class="stat-label">Último Acesso</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${(() => {
            // Contabilizar localizações precisas
            const precisas = traces.filter(trace => trace.preciseLocation && trace.preciseLocation.latitude).length;
            return precisas > 0 ? `${precisas}/${traces.length}` : '0';
          })()}</span>
          <span class="stat-label">Localizações Precisas</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${(() => {
            // Contar dispositivos únicos baseado no User-Agent
            const uniqueDevices = new Set();
            traces.forEach(trace => {
              const ua = trace.userAgent;
              const isMobile = ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone');
              const isTablet = ua.includes('iPad') || ua.includes('Tablet');
              const isDesktop = !isMobile && !isTablet;
              
              if (isMobile) uniqueDevices.add('mobile');
              if (isTablet) uniqueDevices.add('tablet');
              if (isDesktop) uniqueDevices.add('desktop');
            });
            return uniqueDevices.size;
          })()}</span>
          <span class="stat-label">Tipos de Dispositivo</span>
        </div>
      </div>
      
      <h2>Histórico de Acessos</h2>
      ${traces.length === 0 ? 
        '<p class="no-traces">Ainda não há registros de acesso para este link.</p>' :
        traces.map((trace, index) => {
          // Determinar o tipo de dispositivo baseado no User-Agent
          const ua = trace.userAgent;
          let deviceType = 'desktop';
          let deviceIcon = '💻';
          
          if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
            deviceType = 'mobile';
            deviceIcon = '📱';
          } else if (ua.includes('iPad') || ua.includes('Tablet')) {
            deviceType = 'tablet';
            deviceIcon = '📟';
          }
          
          // Extrair navegador e sistema operacional
          let browser = 'Desconhecido';
          let os = 'Desconhecido';
          
          if (ua.includes('Firefox')) browser = 'Firefox';
          else if (ua.includes('Chrome')) browser = 'Chrome';
          else if (ua.includes('Safari')) browser = 'Safari';
          else if (ua.includes('Edge')) browser = 'Edge';
          else if (ua.includes('MSIE') || ua.includes('Trident')) browser = 'Internet Explorer';
          else if (ua.includes('WhatsApp')) browser = 'WhatsApp';
          
          if (ua.includes('Windows')) os = 'Windows';
          else if (ua.includes('Mac OS')) os = 'macOS';
          else if (ua.includes('Android')) os = 'Android';
          else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
          else if (ua.includes('Linux')) os = 'Linux';
          
          return `
            <div class="trace-item">
              <div class="trace-time">
                <strong>Acesso #${index + 1}</strong> - ${new Date(trace.timestamp).toLocaleString('pt-BR')}
              </div>
              <div class="trace-details">
                <div class="trace-details-col">
                  <p><strong>IP:</strong> ${trace.ip}</p>
                  
                  ${(() => {
                    // Verificar se temos localização precisa do usuário
                    if (trace.preciseLocation && trace.preciseLocation.latitude && trace.preciseLocation.longitude) {
                      const precisionMeters = Math.round(trace.preciseLocation.accuracy);
                      return `
                        <div class="precise-location">
                          <p><strong>Localização Exata:</strong> <span class="accuracy-badge alta">Precisão Alta</span></p>
                          <p><strong>Coordenadas GPS:</strong> ${trace.preciseLocation.latitude.toFixed(6)}, ${trace.preciseLocation.longitude.toFixed(6)}</p>
                          <p><strong>Precisão:</strong> ±${precisionMeters} metros</p>
                          ${trace.addressDetails ? `
                            <p><strong>Endereço:</strong> ${trace.addressDetails.formatted || 'Indisponível'}</p>
                            ${trace.addressDetails.road ? `<p><strong>Rua:</strong> ${trace.addressDetails.road}${trace.addressDetails.house_number ? `, ${trace.addressDetails.house_number}` : ''}</p>` : ''}
                            ${trace.addressDetails.neighbourhood ? `<p><strong>Bairro:</strong> ${trace.addressDetails.neighbourhood}</p>` : ''}
                            ${trace.addressDetails.city ? `<p><strong>Cidade:</strong> ${trace.addressDetails.city}</p>` : ''}
                          ` : ''}
                        </div>
                      `;
                    } else {
                      return `
                        <p><strong>Localização:</strong> ${trace.ipInfo.location && trace.ipInfo.location !== 'Desconhecido' ? trace.ipInfo.location : 'Não foi possível determinar a localização'}</p>
                        ${trace.ipInfo.coordinates ? `<p><strong>Coordenadas:</strong> ${trace.ipInfo.coordinates.latitude}, ${trace.ipInfo.coordinates.longitude} <span class="accuracy-badge ${trace.ipInfo.coordinates.accuracy}">(Precisão ${trace.ipInfo.coordinates.accuracy})</span></p>` : ''}
                      `;
                    }
                  })()}
                  
                  ${trace.ipInfo.continent ? `<p><strong>Continente:</strong> ${trace.ipInfo.continent}</p>` : ''}
                  ${trace.ipInfo.timezone ? `<p><strong>Fuso horário:</strong> ${trace.ipInfo.timezone}</p>` : ''}
                  <p><strong>Provedor:</strong> ${trace.ipInfo.isp && trace.ipInfo.isp !== 'Desconhecido' ? trace.ipInfo.isp : 'Informação indisponível'}</p>
                  ${trace.ipInfo.asn && trace.ipInfo.asn !== 'Desconhecido' ? `<p><strong>ASN:</strong> ${trace.ipInfo.asn}</p>` : ''}
                  ${trace.ipInfo.currency ? `<p><strong>Moeda local:</strong> ${trace.ipInfo.currency}</p>` : ''}
                </div>
                <div class="trace-details-col">
                  <p class="device-info"><span class="device-icon">${deviceIcon}</span> <strong>${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}</strong></p>
                  <p><strong>Navegador:</strong> ${browser}</p>
                  <p><strong>Sistema:</strong> ${os}</p>
                  <p><strong>Origem:</strong> ${trace.referer}</p>
                </div>
              </div>
              ${trace.ipInfo.location && trace.ipInfo.location !== 'Local (Simulado)' && 
                trace.ipInfo.location !== 'Desconhecido' && 
                trace.ipInfo.location !== 'Localização não identificada' && 
                trace.ipInfo.location !== 'Erro na obtenção de dados' ? 
                `<div class="map-container" id="map-${index}"></div>` : 
                '<div class="no-map-info"><p>Mapa não disponível para este endereço IP</p></div>'}
            </div>
          `;
        }).join('')
      }
      
      <a href="/" class="back-button">Voltar para a página inicial</a>
    </div>
    
    <script>
      function copyLink() {
        const linkInput = document.getElementById('trackingLink');
        linkInput.select();
        document.execCommand('copy');
        alert('Link copiado para a área de transferência!');
      }
    </script>
    
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        // Inicializar mapas para cada acesso
        ${traces.map((trace, index) => {
          // Se temos localização precisa do HTML5, usamos ela para o mapa
          if (trace.preciseLocation && trace.preciseLocation.latitude && trace.preciseLocation.longitude) {
            const lat = trace.preciseLocation.latitude;
            const lon = trace.preciseLocation.longitude;
            const accuracy = trace.preciseLocation.accuracy;
            
            return `
              try {
                const mapElement = document.getElementById('map-${index}');
                if (mapElement) {
                  const map${index} = L.map('map-${index}').setView([${lat}, ${lon}], 15); // Zoom maior para localização precisa
                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  }).addTo(map${index});
                  
                  // Marcador para a localização exata
                  L.marker([${lat}, ${lon}]).addTo(map${index})
                    .bindPopup('Localização exata${trace.addressDetails && trace.addressDetails.formatted ? '<br>' + trace.addressDetails.formatted : ''}')
                    .openPopup();
                  
                  // Círculo de precisão
                  L.circle([${lat}, ${lon}], {
                    color: '#3498db',
                    fillColor: '#3498db',
                    fillOpacity: 0.15,
                    radius: ${accuracy}
                  }).addTo(map${index});
                }
              } catch (e) {
                console.error('Erro ao processar mapa com geolocalização HTML5:', e);
                const mapElement = document.getElementById('map-${index}');
                if (mapElement) {
                  mapElement.innerHTML = '<p style="padding: 15px; text-align: center;">Erro ao carregar o mapa.</p>';
                }
              }
            `;
          }
          // Caso contrário, verificamos se temos coordenadas do IP
          else if (trace.ipInfo.location && 
              trace.ipInfo.location !== 'Local (Simulado)' && 
              trace.ipInfo.location !== 'Desconhecido' && 
              trace.ipInfo.location !== 'Localização não identificada' && 
              trace.ipInfo.location !== 'Erro na obtenção de dados') {
            
            // Se temos coordenadas diretas, usamos elas para o mapa
            if (trace.ipInfo.coordinates && trace.ipInfo.coordinates.latitude && trace.ipInfo.coordinates.longitude) {
              return `
                try {
                  const mapElement = document.getElementById('map-${index}');
                  if (mapElement) {
                    const map${index} = L.map('map-${index}').setView([${trace.ipInfo.coordinates.latitude}, ${trace.ipInfo.coordinates.longitude}], 6);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(map${index});
                    
                    const accuracyMessage = '${trace.ipInfo.coordinates.accuracy ? `Precisão ${trace.ipInfo.coordinates.accuracy}` : ''}';
                    const marker = L.marker([${trace.ipInfo.coordinates.latitude}, ${trace.ipInfo.coordinates.longitude}]).addTo(map${index})
                      .bindPopup('${trace.ipInfo.location.replace(/'/g, "\\'")}' + (accuracyMessage ? '<br><small>' + accuracyMessage + '</small>' : ''))
                      .openPopup();
                      
                    ${trace.ipInfo.coordinates.accuracy === 'alta' ? `
                    // Se a precisão for alta, adicionamos um círculo de proximidade
                    L.circle([${trace.ipInfo.coordinates.latitude}, ${trace.ipInfo.coordinates.longitude}], {
                      color: 'blue',
                      fillColor: '#3498db',
                      fillOpacity: 0.1,
                      radius: 500
                    }).addTo(map${index});
                    ` : ''}
                  }
                } catch (e) {
                  console.error('Erro ao processar mapa com coordenadas diretas:', e);
                  const mapElement = document.getElementById('map-${index}');
                  if (mapElement) {
                    mapElement.innerHTML = '<p style="padding: 15px; text-align: center;">Erro ao carregar o mapa.</p>';
                  }
                }
              `;
            }
            
            // Caso contrário, usamos a busca por localização como antes
            // Preparar a consulta para o serviço de geocodificação
            let searchQuery = trace.ipInfo.location;
            
            // Se a localização contém apenas um nome sem vírgulas, adicionamos a palavra "país" para melhorar a busca
            if (!searchQuery.includes(',') && searchQuery.trim().split(' ').length === 1) {
              searchQuery = `${searchQuery} país`;
            }
            
            return `
              try {
                fetch('https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1')
                  .then(response => response.json())
                  .then(data => {
                    if (data && data.length > 0) {
                      const mapElement = document.getElementById('map-${index}');
                      if (mapElement) {
                        const map${index} = L.map('map-${index}').setView([data[0].lat, data[0].lon], 6);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }).addTo(map${index});
                        
                        L.marker([data[0].lat, data[0].lon]).addTo(map${index})
                          .bindPopup('${trace.ipInfo.location.replace(/'/g, "\\'")} <br><small>Localização aproximada</small>')
                          .openPopup();
                      }
                    } else {
                      console.log('Não foi possível encontrar coordenadas para: ${trace.ipInfo.location}');
                      const mapElement = document.getElementById('map-${index}');
                      if (mapElement) {
                        mapElement.innerHTML = '<p style="padding: 15px; text-align: center;">Não foi possível carregar o mapa para esta localização.</p>';
                      }
                    }
                  })
                  .catch(err => {
                    console.error('Erro ao carregar mapa:', err);
                    const mapElement = document.getElementById('map-${index}');
                    if (mapElement) {
                      mapElement.innerHTML = '<p style="padding: 15px; text-align: center;">Erro ao carregar o mapa.</p>';
                    }
                  });
              } catch (e) {
                console.error('Erro ao processar mapa:', e);
              }
            `;
          }
          return '';
        }).join('')}
      });
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Pagina inicial/root (Vamos enviar uma página simples de formulário)
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eye of God - Rastreador de Mensagens</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 0;
        background-color: #f8f9fa;
        color: #333;
      }
      .container {
        max-width: 800px;
        margin: 40px auto;
        padding: 20px;
      }
      header {
        background: linear-gradient(135deg, #2c3e50, #34495e);
        color: white;
        padding: 40px 20px;
        text-align: center;
        border-radius: 8px 8px 0 0;
        position: relative;
        overflow: hidden;
      }
      header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: url('https://www.transparenttextures.com/patterns/cubes.png');
        opacity: 0.1;
      }
      .content {
        background: white;
        padding: 30px;
        border-radius: 0 0 8px 8px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.05);
      }
      h1 {
        margin: 0;
        font-size: 2.5em;
        letter-spacing: 1px;
      }
      header p {
        margin: 10px 0 0;
        font-size: 1.2em;
        opacity: 0.9;
      }
      .form-group {
        margin-bottom: 25px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: #2c3e50;
      }
      input[type="text"] {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1em;
        transition: border-color 0.3s, box-shadow 0.3s;
      }
      input[type="text"]:focus {
        border-color: #3498db;
        box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.25);
        outline: none;
      }
      button {
        background: #3498db;
        color: white;
        border: none;
        padding: 14px 25px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1em;
        font-weight: 500;
        transition: background 0.3s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      button:hover {
        background: #2980b9;
      }
      button svg {
        margin-right: 8px;
      }
      .result {
        margin-top: 30px;
        padding: 20px;
        background-color: #f8f9fa;
        border-radius: 8px;
        display: none;
        border-left: 4px solid #3498db;
      }
      .result h3 {
        margin-top: 0;
        color: #2c3e50;
      }
      .result a {
        color: #3498db;
        text-decoration: none;
        word-break: break-all;
      }
      .result a:hover {
        text-decoration: underline;
      }
      .copy-container {
        display: flex;
        align-items: center;
        background: #eee;
        padding: 8px;
        border-radius: 4px;
        margin: 10px 0;
      }
      .copy-container input {
        flex: 1;
        border: none;
        background: transparent;
        padding: 5px;
      }
      .copy-btn {
        background: #3498db;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
        margin-left: 8px;
      }
      .features {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin: 30px 0;
      }
      .feature {
        flex: 1;
        min-width: 200px;
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .feature-icon {
        font-size: 2.5em;
        margin-bottom: 15px;
        color: #3498db;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        color: #7f8c8d;
        font-size: 0.9em;
      }
      .qr-code {
        text-align: center;
        margin: 20px 0;
      }
      .loading {
        display: none;
        text-align: center;
        padding: 20px;
      }
      .spinner {
        border: 3px solid #f3f3f3;
        border-radius: 50%;
        border-top: 3px solid #3498db;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto 10px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>Eye of God</h1>
        <p>Sistema de Rastreamento de Mensagens</p>
      </header>
      
      <div class="content">
        <h2>Gerar Link de Rastreamento</h2>
        <p>Este sistema permite rastrear mensagens desde o envio até o destino. Crie um link personalizado, compartilhe-o e monitore sua jornada.</p>
        
        <div class="features">
          <div class="feature">
            <div class="feature-icon">🔗</div>
            <h3>Links Rastreáveis</h3>
            <p>Gere links únicos para compartilhar em mensagens</p>
          </div>
          <div class="feature">
            <div class="feature-icon">🌍</div>
            <h3>Geolocalização</h3>
            <p>Visualize a localização dos acessos no mapa</p>
          </div>
          <div class="feature">
            <div class="feature-icon">📊</div>
            <h3>Estatísticas</h3>
            <p>Analise detalhes sobre cada acesso ao link</p>
          </div>
        </div>
        
        <form id="linkForm">
          <div class="form-group">
            <label for="targetUrl">URL de Destino:</label>
            <input type="text" id="targetUrl" name="targetUrl" placeholder="https://exemplo.com" required>
            <small style="color:#666;display:block;margin-top:5px;">Insira a URL para onde seu link deve redirecionar</small>
          </div>
          
          <button type="submit">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1 1 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4 4 0 0 1-.128-1.287z"/>
              <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243z"/>
            </svg>
            Gerar Link
          </button>
        </form>
        
        <div class="loading" id="loading">
          <div class="spinner"></div>
          <p>Gerando seu link de rastreamento...</p>
        </div>
        
        <div class="result" id="result">
          <h3>Link Gerado com Sucesso!</h3>
          
          <p><strong>Link de Rastreamento:</strong></p>
          <div class="copy-container">
            <input type="text" readonly id="trackingLink">
            <button class="copy-btn" onclick="copyLink('trackingLink')">Copiar</button>
          </div>
          
          <p><strong>Página de Informações:</strong></p>
          <div class="copy-container">
            <input type="text" readonly id="infoLink">
            <button class="copy-btn" onclick="copyLink('infoLink')">Copiar</button>
          </div>
          
          <div class="qr-code" id="qrCode"></div>
          
          <p>Use este link em suas mensagens e depois acesse a página de informações para ver o caminho percorrido.</p>
          <p><a href="#" id="openInfoLink">Ver estatísticas de rastreamento →</a></p>
        </div>
      </div>
      
      <div class="footer">
        <p>Eye of God - Sistema de Rastreamento de Mensagens</p>
        <p>Desenvolvido para a disciplina de Redes</p>
      </div>
    </div>
    
    <script>
      document.getElementById('linkForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const targetUrl = document.getElementById('targetUrl').value;
        const loading = document.getElementById('loading');
        const result = document.getElementById('result');
        
        // Mostrar loading
        loading.style.display = 'block';
        result.style.display = 'none';
        
        try {
          const response = await fetch('/api/generate-link', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUrl })
          });
          
          const data = await response.json();
          
          if (data.success) {
            const trackingLink = document.getElementById('trackingLink');
            const infoLink = document.getElementById('infoLink');
            const openInfoLink = document.getElementById('openInfoLink');
            const qrCode = document.getElementById('qrCode');
            
            // Preencher os campos
            trackingLink.value = data.trackingLink;
            infoLink.value = window.location.origin + '/info/' + data.linkId;
            openInfoLink.href = '/info/' + data.linkId;
            
            // Gerar QR Code
            qrCode.innerHTML = 
              '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + 
              encodeURIComponent(data.trackingLink) + 
              '" alt="QR Code do link">' +
              '<p>Escaneie este QR Code para acessar o link</p>';
            
            // Esconder loading e mostrar resultado
            loading.style.display = 'none';
            result.style.display = 'block';
          } else {
            loading.style.display = 'none';
            alert('Erro ao gerar link: ' + data.error);
          }
        } catch (error) {
          loading.style.display = 'none';
          console.error('Erro:', error);
          alert('Erro ao gerar link. Verifique sua conexão e tente novamente.');
        }
      });
      
      function copyLink(elementId) {
        const linkInput = document.getElementById(elementId);
        linkInput.select();
        document.execCommand('copy');
        
        // Feedback visual
        const btn = linkInput.nextElementSibling;
        const originalText = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
}); 
