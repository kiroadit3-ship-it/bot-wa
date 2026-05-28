const express = require('express');
const cors = require('cors');
const pino = require('pino');
const qrcode = require('qrcode-terminal'); // Tambahkan library ini untuk cetak QR manual
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

let sock; 

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        // printQRInTerminal: true, <--- INI SUDAH DIHAPUS
        logger: pino({ level: 'silent' }), 
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // TANGKAP QR CODE DAN CETAK MANUAL KE TERMINAL
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('\n[!] Silakan scan QR Code di atas menggunakan WhatsApp Anda\n');
        }

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

const PORT = 3001; 
app.listen(PORT, () => {
    console.log(`\n==========================================`);
    console.log(`🚀 Server Bot WA berjalan di port ${PORT}`);
    console.log(`==========================================\n`);
});
