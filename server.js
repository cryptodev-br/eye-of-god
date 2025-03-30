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

// Obter informações do IP
async function getIPInfo(ip) {
  try {
    // Limpar o IP para remover o prefixo IPv6 (se estiver sendo executado em ambientes de proxy)
    let cleanIp = ip;
    if (ip.includes('::ffff:')) {
      cleanIp = ip.replace('::ffff:', '');
    }
    
    // Se for localhost ou IP privado, usamos um IP público para simulação
    if (cleanIp === '::1' || cleanIp === '127.0.0.1' || 
        cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || 
        cleanIp.startsWith('172.')) {
      return {
        ip: cleanIp,
        location: 'Local (Simulado)',
        isp: 'Local Network',
        asn: 'N/A',
        org: 'Local Network'
      };
    }
    
    const response = await fetch(`http://ip-api.com/json/${cleanIp}`);
    const data = await response.json();
    
    if (data.status === 'fail') {
      return {
        ip: cleanIp,
        location: 'Não encontrado',
        isp: 'Desconhecido',
        asn: 'Desconhecido',
        org: 'Desconhecido'
      };
    }
    
    return {
      ip: cleanIp,
      location: `${data.city || 'Desconhecido'}, ${data.regionName || 'Desconhecido'}, ${data.country || 'Desconhecido'}`,
      isp: data.isp || 'Desconhecido',
      asn: data.as || 'Desconhecido',
      org: data.org || 'Desconhecido'
    };
  } catch (error) {
    console.error('Erro ao obter informações do IP:', error);
    return {
      ip: cleanIp || ip,
      location: 'Desconhecido',
      isp: 'Desconhecido',
      asn: 'Desconhecido',
      org: 'Desconhecido'
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
    createdBy: req.ip
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
  const ipInfo = await getIPInfo(req.ip);
  const timestamp = new Date().toISOString();
  
  // Adicionar à lista de rastreamentos
  db.traces[linkId].push({
    timestamp,
    ip: req.ip,
    ipInfo,
    userAgent,
    referer: req.get('Referer') || 'Direto'
  });
  
  writeDB(db);
  
  // Redirecionar para a URL original
  res.redirect(db.links[linkId].targetUrl);
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
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 20px;
        color: #333;
        background-color: #f4f4f4;
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
        background: white;
        padding: 20px;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }
      h1 {
        color: #2c3e50;
        border-bottom: 2px solid #3498db;
        padding-bottom: 10px;
      }
      .link-info {
        background-color: #f9f9f9;
        padding: 15px;
        border-radius: 5px;
        margin-bottom: 20px;
      }
      .trace-item {
        border-left: 3px solid #3498db;
        padding: 10px;
        margin-bottom: 15px;
        background-color: #f9f9f9;
      }
      .trace-time {
        color: #7f8c8d;
        font-size: 0.9em;
      }
      .trace-details {
        margin-top: 5px;
      }
      .no-traces {
        color: #95a5a6;
        font-style: italic;
      }
      .back-button {
        display: inline-block;
        margin-top: 20px;
        background-color: #3498db;
        color: white;
        padding: 10px 15px;
        text-decoration: none;
        border-radius: 5px;
      }
      @media (max-width: 768px) {
        .container {
          padding: 10px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Rastreamento de Link</h1>
      
      <div class="link-info">
        <h2>Informações do Link</h2>
        <p><strong>Link de rastreamento:</strong> ${req.protocol}://${req.get('host')}/t/${linkId}</p>
        <p><strong>URL de destino:</strong> ${link.targetUrl}</p>
        <p><strong>Criado em:</strong> ${new Date(link.createdAt).toLocaleString('pt-BR')}</p>
      </div>
      
      <h2>Histórico de Acessos</h2>
      ${traces.length === 0 ? 
        '<p class="no-traces">Ainda não há registros de acesso para este link.</p>' :
        traces.map((trace, index) => `
          <div class="trace-item">
            <div class="trace-time">
              <strong>Acesso #${index + 1}</strong> - ${new Date(trace.timestamp).toLocaleString('pt-BR')}
            </div>
            <div class="trace-details">
              <p><strong>IP:</strong> ${trace.ip}</p>
              <p><strong>Localização:</strong> ${trace.ipInfo.location}</p>
              <p><strong>Provedor:</strong> ${trace.ipInfo.isp}</p>
              <p><strong>Navegador:</strong> ${trace.userAgent}</p>
              <p><strong>Origem:</strong> ${trace.referer}</p>
            </div>
          </div>
        `).join('')
      }
      
      <a href="/" class="back-button">Voltar para a página inicial</a>
    </div>
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
        font-family: Arial, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 0;
        background-color: #f4f4f4;
        color: #333;
      }
      .container {
        max-width: 800px;
        margin: 40px auto;
        padding: 20px;
      }
      header {
        background: #2c3e50;
        color: white;
        padding: 20px;
        text-align: center;
        border-radius: 5px 5px 0 0;
      }
      .content {
        background: white;
        padding: 20px;
        border-radius: 0 0 5px 5px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }
      h1 {
        margin: 0;
      }
      .form-group {
        margin-bottom: 20px;
      }
      label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }
      input[type="text"] {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-size: 1em;
      }
      button {
        background: #3498db;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 1em;
      }
      button:hover {
        background: #2980b9;
      }
      .result {
        margin-top: 20px;
        padding: 15px;
        background-color: #f9f9f9;
        border-radius: 5px;
        display: none;
      }
      .result h3 {
        margin-top: 0;
        color: #2c3e50;
      }
      .result a {
        color: #3498db;
        text-decoration: none;
      }
      .result a:hover {
        text-decoration: underline;
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
        <p>Crie um link que pode ser rastreado ao longo de sua jornada até chegar ao destinatário.</p>
        
        <form id="linkForm">
          <div class="form-group">
            <label for="targetUrl">URL de Destino:</label>
            <input type="text" id="targetUrl" name="targetUrl" placeholder="https://exemplo.com" required>
          </div>
          
          <button type="submit">Gerar Link</button>
        </form>
        
        <div class="result" id="result">
          <h3>Link Gerado:</h3>
          <p>Link de Rastreamento: <a href="#" id="trackingLink"></a></p>
          <p>Use este link em suas mensagens, e depois veja o caminho percorrido acessando:</p>
          <p>Página de Informações: <a href="#" id="infoLink"></a></p>
        </div>
      </div>
    </div>
    
    <script>
      document.getElementById('linkForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const targetUrl = document.getElementById('targetUrl').value;
        
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
            const result = document.getElementById('result');
            const trackingLink = document.getElementById('trackingLink');
            const infoLink = document.getElementById('infoLink');
            
            trackingLink.href = data.trackingLink;
            trackingLink.textContent = data.trackingLink;
            
            infoLink.href = '/info/' + data.linkId;
            infoLink.textContent = window.location.origin + '/info/' + data.linkId;
            
            result.style.display = 'block';
          } else {
            alert('Erro ao gerar link: ' + data.error);
          }
        } catch (error) {
          console.error('Erro:', error);
          alert('Erro ao gerar link. Verifique o console para mais detalhes.');
        }
      });
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