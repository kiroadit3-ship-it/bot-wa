const express = require('express');
const cors = require('cors');
const pino = require('pino');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

let sock; 

// ==========================================
// 1. MASUKKAN NOMOR WA BOT KAMU DI SINI
// (Gunakan awalan 62 tanpa tanda + atau spasi)
// Contoh: "6281234567890"
// ==========================================
const botNumber = "628xxxxxxxxxx"; 

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), 
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // ==========================================
    // 2. LOGIKA MEMINTA PAIRING CODE
    // ==========================================
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(botNumber);
                // Format kode jadi XXXX-XXXX biar rapi
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n==========================================`);
                console.log(`[!] KODE TAUTAN ANDA: ${code}`);
                console.log(`==========================================\n`);
                console.log(`Buka WA > Perangkat Tertaut > Tautkan dengan Nomor Telepon Saja\n`);
            } catch (err) {
                console.error('Gagal meminta Pairing Code:', err);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[!] Koneksi terputus. Alasan:', lastDisconnect.error?.message);
            
            if (shouldReconnect) {
                console.log('[!] Menghubungkan ulang...');
                connectToWhatsApp();
            } else {
                console.log('[!] Anda telah logout dari WhatsApp. Silakan hapus folder "auth_info_baileys" dan restart server.');
            }
        } else if (connection === 'open') {
            console.log('\n[✓] WhatsApp Bot Berhasil Terhubung!\n');
        }
    });
}

connectToWhatsApp();

// ==========================================
// API ENDPOINT UNTUK MENERIMA REQUEST DARI NEXT.JS
// ==========================================
app.post('/send-message', async (req, res) => {
    try {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({ success: false, message: 'Parameter "number" dan "message" wajib diisi!' });
        }

        let formattedNumber = number.replace(/\D/g, ''); 
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.slice(1);
        }

        const waJid = `${formattedNumber}@s.whatsapp.net`;

        if (!sock) {
            return res.status(500).json({ success: false, message: 'Bot WhatsApp belum siap' });
        }

        await sock.sendMessage(waJid, { text: message });
        
        console.log(`[INFO] Pesan berhasil dikirim ke: ${formattedNumber}`);
        return res.status(200).json({ success: true, message: 'Pesan berhasil dikirim' });

    } catch (error) {
        console.error('[ERROR] Gagal mengirim pesan:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3001; 
app.listen(PORT, () => {
    console.log(`\n==========================================`);
    console.log(`🚀 Server Bot WA berjalan di port ${PORT}`);
    console.log(`==========================================\n`);
});
