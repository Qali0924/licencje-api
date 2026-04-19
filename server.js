require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja Supabase (Upewnij się, że masz te dane w pliku .env)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Funkcja generująca profesjonalne klucze ABCD-1234-EFGH-5678
function generateKey(segments = 4, length = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = [];
    for (let i = 0; i < segments; i++) {
        let segment = '';
        for (let j = 0; j < length; j++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        key.push(segment);
    }
    return key.join('-');
}

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serwuje Twój frontend
app.use(session({
    secret: process.env.SESSION_SECRET || 'cloud_math_secret_123',
    resave: false,
    saveUninitialized: false,
}));

// --- KONFIGURACJA PASSPORT (DISCORD AUTH) ---
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.BASE_URL + '/auth/discord/callback',
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// Middleware sprawdzający czy użytkownik jest zalogowany
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Brak autoryzacji. Zaloguj się przez Discord.' });
}

// --- LOGIKA AUTORYZACJI ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/');
});
app.get('/auth/logout', (req, res) => {
    req.logout(() => { res.redirect('/'); });
});

// --- API: PROFIL UŻYTKOWNIKA ---
app.get('/api/user', async (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id;
        
        // Pobierz dane konta (saldo, sloty, klucz weryfikacyjny)
        let { data: account, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('owner_id', userId)
            .single();

        // Jeśli konto nie istnieje - stwórz je (pierwsze logowanie)
        if (error && !account) {
            const { data: newAcc, error: createError } = await supabase
                .from('accounts')
                .insert([{ 
                    owner_id: userId, 
                    verification_key: `VKEY-${uuidv4().split('-')[0].toUpperCase()}`,
                    balance: 0,
                    max_slots: 20
                }])
                .select().single();
            
            if (createError) return res.status(500).json({ message: 'Błąd bazy danych' });
            account = newAcc;
        }

        res.json({ ...req.user, account });
    } else {
        res.status(401).json({ message: 'Niezalogowany' });
    }
});

// --- API: ZARZĄDZANIE LICENCJAMI ---

// Pobieranie listy
app.get('/api/licenses', isLoggedIn, async (req, res) => {
    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('owner_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Tworzenie nowej licencji
app.post('/api/licenses', isLoggedIn, async (req, res) => {
    const { pluginName, discordId, ipLimit, validityDays } = req.body;

    let expiresAt = null;
    if (validityDays && parseInt(validityDays) > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(validityDays));
    }

    const { data, error } = await supabase.from('licenses').insert([{
        key: `DH-${uuidv4().split('-')[0].toUpperCase()}`,
        plugin_name: pluginName,
        discord_id: discordId || null,
        ip_limit: parseInt(ipLimit) || 1,
        expires_at: expiresAt,
        owner_id: req.user.id,
        is_active: true, // Nowa zawsze aktywna
        ips: []
    }]).select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

// TARCZA: Przełączanie statusu (Aktywna / Zablokowana)
app.patch('/api/licenses/:id/toggle', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    
    // Sprawdź obecny stan
    const { data: license } = await supabase
        .from('licenses')
        .select('is_active')
        .eq('id', id)
        .eq('owner_id', req.user.id)
        .single();

    if (!license) return res.status(404).json({ error: 'Nie znaleziono' });

    const { error } = await supabase
        .from('licenses')
        .update({ is_active: !license.is_active })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// RESET IP
app.post('/api/licenses/:id/reset_ips', isLoggedIn, async (req, res) => {
    const { error } = await supabase
        .from('licenses')
        .update({ ips: [] })
        .eq('id', req.params.id)
        .eq('owner_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// USUWANIE (KOSZ)
app.delete('/api/licenses/:id', isLoggedIn, async (req, res) => {
    const { error } = await supabase
        .from('licenses')
        .delete()
        .eq('id', req.params.id)
        .eq('owner_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ZEGAR: Pobieranie logów (Historia)
app.get('/api/licenses/:id/logs', isLoggedIn, async (req, res) => {
    const { data, error } = await supabase
        .from('license_logs')
        .select('*')
        .eq('license_id', req.params.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// --- API DLA PLUGINU (WALIDACJA + AUTOMATYCZNE LOGI) ---
app.post('/api/validate', async (req, res) => {
    const { key, ip } = req.body;
    if (!key || !ip) return res.status(400).json({ valid: false, reason: 'Błąd danych.' });

    const { data: license } = await supabase.from('licenses').select('*').eq('key', key).single();

    if (!license) return res.json({ valid: false, reason: 'Klucz nie istnieje.' });

    // Funkcja pomocnicza do zapisu logów
    const log = async (status, action) => {
        await supabase.from('license_logs').insert([{ 
            license_id: license.id, 
            ip, 
            status, 
            action 
        }]);
    };

    // 1. Sprawdź blokadę (TARCZA)
    if (!license.is_active) {
        await log('FAILED', 'BLOCKED');
        return res.json({ valid: false, reason: 'Licencja zablokowana.' });
    }

    // 2. Sprawdź datę
    if (license.expires_at && new Date() > new Date(license.expires_at)) {
        await log('FAILED', 'EXPIRED');
        return res.json({ valid: false, reason: 'Licencja wygasła.' });
    }

    // 3. Sprawdź IP
    if (license.ips.includes(ip)) {
        await log('SUCCESS', 'VERIFY');
        return res.json({ valid: true, discordId: license.discord_id });
    }

    // 4. Rejestracja nowego IP
    if (license.ips.length < license.ip_limit) {
        const newIps = [...license.ips, ip];
        await supabase.from('licenses').update({ ips: newIps }).eq('id', license.id);
        await log('SUCCESS', 'NEW_IP');
        return res.json({ valid: true, discordId: license.discord_id });
    }

    await log('FAILED', 'IP_LIMIT');
    return res.json({ valid: false, reason: 'Limit IP osiągnięty.' });
});

// --- SYSTEM PŁATNOŚCI (SKLEP) ---
app.post('/api/buy-slots', isLoggedIn, async (req, res) => {
    const { data: acc } = await supabase.from('accounts').select('*').eq('owner_id', req.user.id).single();
    if (acc.balance < 5) return res.status(400).json({ error: 'Brak środków (5 PLN)' });

    await supabase.from('accounts').update({ 
        balance: acc.balance - 5, 
        max_slots: acc.max_slots + 10 
    }).eq('owner_id', req.user.id);
    
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
