# Eye of God - Sistema de Rastreamento de Mensagens

Este é um sistema desenvolvido para a disciplina de Redes, com o objetivo de mapear transações de mensagens desde a origem até o destino.

## Funcionalidades

- Geração de links únicos para rastreamento
- Captura de informações sobre cada acesso (IP, localização, provedor, navegador)
- Visualização detalhada do caminho percorrido pela mensagem
- Interface web amigável para criar e visualizar os rastreamentos

## Como Funciona

1. O usuário gera um link de rastreamento informando uma URL de destino
2. O link gerado pode ser enviado por mensagens, e-mails ou qualquer outro meio
3. Quando alguém acessa o link, o sistema registra informações sobre o acesso
4. O sistema então redireciona o usuário para a URL de destino original
5. O criador do link pode verificar todos os acessos através da página de informações

## Tecnologias Utilizadas

- **Backend**: Node.js, Express
- **Armazenamento**: Sistema de arquivo (JSON)
- **Frontend**: HTML, CSS, JavaScript vanilla (embutido no servidor)

## Requisitos

- Node.js (v14+)
- NPM ou Yarn

## Instalação

1. Clone o repositório
2. Instale as dependências:

```bash
cd backend
npm install
```

3. Inicie o servidor:

```bash
npm start
```

4. Acesse a aplicação em: http://localhost:3000

## Uso

1. Acesse a página inicial do sistema
2. Insira a URL de destino no formulário
3. Clique em "Gerar Link"
4. Copie o link gerado e compartilhe-o
5. Acompanhe o rastreamento através da página de informações

## Explicação Técnica

O sistema cria um identificador único (UUID) para cada link gerado. Quando alguém acessa o link de rastreamento, o sistema:

1. Captura informações sobre o acesso (IP, User-Agent, Referer)
2. Consulta serviços externos para obter mais informações sobre o IP (localização, provedor)
3. Armazena essas informações no histórico do link
4. Redireciona o usuário para a URL original

Este processo permite mapear todo o caminho da mensagem, desde o envio até o destino final.

## Limitações

- O sistema só rastreia acessos através dos links gerados
- Não é possível rastrear mensagens que não utilizem os links do sistema
- As informações de geolocalização do IP podem não ser 100% precisas

## Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## Licença

Este projeto é para fins educacionais e de estudo. 