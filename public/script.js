document.addEventListener('DOMContentLoaded', () => {
    // Sekcje i elementy
    const authContainer = document.getElementById('auth-container');
    const loginPrompt = document.getElementById('login-prompt');
    const appContent = document.getElementById('app-content');
    const licenseList = document.getElementById('license-list');
    const modalOverlay = document.getElementById('modal-overlay');
    const logOverlay = document.getElementById('log-overlay');
    const toastContainer = document.getElementById('toast-container');
    const addLicenseBtn = document.getElementById('add-license-btn');
    const closeModalBtn = document.getElementById('modal-close-btn');
    const cancelModalBtn = document.getElementById('modal-cancel-btn');
    const licenseForm = document.getElementById('license-form');

    // --- SYSTEM POWIADOMIEŃ (TOAST) ---
    function showToast(message, type = 'info') {
        // Usuwamy stare toasty jeśli jest ich za dużo
        if (toastContainer.children.length > 3) toastContainer.removeChild(toastContainer.firstChild);

        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-secondary' : type === 'error' ? 'bg-red-500' : 'bg-orange-500';
        
        toast.className = `${bgColor} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce-in text-sm font-bold transition-all duration-500`;
        toast.innerHTML = `
            <i class="bi ${type === 'success' ? 'bi-check-all' : type === 'error' ? 'bi-exclamation-triangle' : 'bi-info-circle'}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // --- GŁÓWNA LOGIKA AUTORYZACJI ---
    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const user = await response.json();
                await renderLoggedInView(user);
            } else {
                renderLoggedOutView();
            }
        } catch (error) {
            console.error('Błąd połączenia z API:', error);
            renderLoggedOutView();
        }
    }

    async function renderLoggedInView(user) {
        loginPrompt.classList.add('hidden');
        appContent.classList.remove('hidden');
        renderAuthUI(user);
        await loadCategories(); // Pobierz kategorie zaraz po zalogowaniu
        await renderDashboard(user);
        await renderLicenseList();
    }

    function renderLoggedOutView() {
        appContent.classList.add('hidden');
        loginPrompt.classList.remove('hidden');
        authContainer.innerHTML = `
            <a href="/auth/discord" class="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded-lg font-bold text-sm transition-all">
                <i class="bi bi-discord"></i> Zaloguj się przez Discord
            </a>
        `;
    }

    function renderAuthUI(user) {
        authContainer.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="hidden md:flex flex-col items-end">
                    <span class="text-white font-bold text-sm">${user.username}</span>
                    <span class="text-secondary text-[10px] font-black uppercase tracking-tighter">${user.balance || '0.00'} PLN</span>
                </div>
                <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="Avatar" class="w-10 h-10 rounded-xl border border-white/10 shadow-lg">
                <a href="/auth/logout" class="text-zinc-500 hover:text-white transition-colors">
                    <span class="material-symbols-outlined text-xl">logout</span>
                </a>
            </div>
        `;
    }

    async function renderDashboard(user) {
        document.getElementById('admin-key').textContent = user.id || 'BŁĄD';
        document.getElementById('public-key').textContent = user.account?.verification_key || 'BRAK KLUCZA';
        
        const licenses = await fetchLicenses();
        const maxSlots = user.account?.max_slots || 20;
        const currentSlots = licenses.length;
        const percentage = (currentSlots / maxSlots) * 100;

        document.querySelector('.slots-count').textContent = `${currentSlots} / ${maxSlots}`;
        document.querySelector('.progress').style.width = `${percentage}%`;
    }

    async function fetchLicenses() {
        const response = await fetch('/api/licenses');
        return response.ok ? await response.json() : [];
    }

async function renderLicenseList() {
    licenseList.innerHTML = `<div class="text-zinc-600 animate-pulse text-sm py-10 text-center">Synchronizacja z bazą danych...</div>`;
    try {
        let licenses = await fetchLicenses();
        
        // FILTROWANIE PO KATEGORII
        if (selectedCategoryId !== null) {
            licenses = licenses.filter(lic => lic.category_id === selectedCategoryId);
        }

        licenseList.innerHTML = '';
        if (licenses.length === 0) {
            licenseList.innerHTML = `<div class="bg-white/5 border border-dashed border-white/10 p-10 rounded-2xl text-center text-zinc-500 text-sm">Brak licencji w tej kategorii.</div>`;
            return;
        }
        licenses.forEach(renderSingleLicense);
    } catch (e) {
        licenseList.innerHTML = `<div class="text-red-500 text-sm text-center">Błąd krytyczny listy.</div>`;
    }
}
    function renderSingleLicense(license) {
        const isActive = license.is_active !== false;
        const expiration = license.expires_at ? new Date(license.expires_at).toLocaleDateString('pl-PL') : 'NIGDY';

        const el = document.createElement('div');
        el.className = 'bg-surface-container-low border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 group hover:border-primary-container/30 transition-all';
        el.dataset.licenseId = license.id;

        el.innerHTML = `
            <div class="flex items-center gap-4 w-full md:w-auto">
                <div class="w-12 h-12 ${isActive ? 'bg-primary-container/10 text-primary-container' : 'bg-red-500/10 text-red-500'} rounded-xl flex items-center justify-center">
                    <i class="bi ${isActive ? 'bi-shield-check' : 'bi-shield-slash'} text-xl"></i>
                </div>
                <div>
                    <h4 class="text-white font-bold uppercase tracking-tight">${license.plugin_name}</h4>
                    <div class="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                        KEY: ${license.key} 
                        <i class="bi bi-clipboard cursor-pointer hover:text-white copy-icon" data-copy-text="${license.key}"></i>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between w-full md:w-auto md:gap-8">
                <div class="text-right">
                    <p class="text-[9px] text-zinc-500 uppercase font-black tracking-widest">LIMIT IP</p>
                    <p class="text-white font-medium text-xs">${license.ips?.length || 0} / ${license.ip_limit}</p>
                </div>
                <div class="text-right border-l border-white/5 pl-8">
                    <p class="text-[9px] text-zinc-500 uppercase font-black tracking-widest">WAŻNOŚĆ</p>
                    <p class="text-secondary font-medium text-xs">${expiration}</p>
                </div>
                <div class="flex items-center gap-2 border-l border-white/5 pl-8">
                    <button class="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-primary-container/20 hover:text-primary-container transition-all open-logs-btn" title="Historia">
                        <i class="bi bi-clock-history"></i>
                    </button>
                    <button class="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-blue-500/20 hover:text-blue-400 transition-all reset-ip-btn" title="Resetuj IP">
                        <i class="bi bi-arrow-counterclockwise"></i>
                    </button>
                    <button class="w-9 h-9 flex items-center justify-center rounded-lg ${isActive ? 'bg-orange-500/10 text-orange-500' : 'bg-green-500/10 text-green-500'} transition-all toggle-status-btn" title="${isActive ? 'Zablokuj' : 'Aktywuj'}">
                        <i class="bi ${isActive ? 'bi-shield-shaded' : 'bi-shield-fill-check'}"></i>
                    </button>
                    <button class="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-red-500/20 hover:text-red-500 transition-all delete-license-btn" title="Usuń">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            </div>
        `;
        licenseList.appendChild(el);
    }

    // --- FUNKCJA LOGÓW ---
    async function openLogs(id) {
        const listEl = document.getElementById('log-list');
        listEl.innerHTML = `<div class="text-center py-10 animate-pulse text-zinc-600 italic text-sm">Łączenie z serwerem logów...</div>`;
        logOverlay.classList.remove('hidden');

        try {
            const res = await fetch(`/api/licenses/${id}/logs`);
            if (!res.ok) throw new Error();
            const logs = await res.json();

            if (!logs || logs.length === 0) {
                listEl.innerHTML = `<div class="text-center py-10 text-zinc-600 text-sm">Brak historii aktywności.</div>`;
                return;
            }

            listEl.innerHTML = logs.map(log => `
                <div class="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-white/5">
                    <div class="flex items-center gap-3">
                        <span class="px-2 py-1 ${log.status === 'SUCCESS' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'} text-[10px] font-bold rounded">
                            ${log.status || 'LOG'}
                        </span>
                        <span class="text-zinc-400 text-[11px]">${new Date(log.created_at).toLocaleString('pl-PL')}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-zinc-500 font-mono text-[11px] block">${log.ip || '0.0.0.0'}</span>
                        <span class="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">${log.action || 'WERYFIKACJA'}</span>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            listEl.innerHTML = `<div class="text-red-500 text-center py-10 font-bold uppercase text-xs">Błąd pobierania logów - sprawdź API</div>`;
        }
    }

    // --- DELEGACJA KLIKNIĘĆ ---
    document.body.addEventListener('click', async (e) => {
        const target = e.target;
        const btn = target.closest('button, .copy-icon');
        if (!btn) return;

        const licenseId = btn.closest('[data-license-id]')?.dataset.licenseId;

        // Kopiowanie
        if (btn.classList.contains('copy-icon')) {
            navigator.clipboard.writeText(btn.dataset.copyText);
            showToast('Klucz skopiowany!', 'info');
        }

        // Logi
        if (btn.classList.contains('open-logs-btn')) openLogs(licenseId);

        // Reset IP
        if (btn.classList.contains('reset-ip-btn')) {
            const res = await fetch(`/api/licenses/${licenseId}/reset_ips`, { method: 'POST' });
            if (res.ok) {
                showToast('Limity IP zresetowane pomyślnie!', 'success');
                await renderLicenseList();
            }
        }

        // Tarcza (Toggle)
        if (btn.classList.contains('toggle-status-btn')) {
            const res = await fetch(`/api/licenses/${licenseId}/toggle`, { method: 'PATCH' });
            if (res.ok) {
                showToast('Zaktualizowano status licencji', 'success');
                await renderLicenseList();
            } else {
                showToast('Błąd przy przełączaniu tarczy', 'error');
            }
        }

        // Kosz (Usuwanie)
        if (btn.classList.contains('delete-license-btn')) {
            if (confirm('CZY NA PEWNO CHCESZ USUNĄĆ TĘ LICENCJĘ?')) {
                const res = await fetch(`/api/licenses/${licenseId}`, { method: 'DELETE' });
                if (res.ok) {
                    showToast('Licencja została usunięta', 'error');
                    await renderLicenseList();
                }
            }
        }
    });

// Formularz dodawania licencji - ZAKTUALIZOWANY
licenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = "WYSYŁANIE...";
    submitBtn.disabled = true;

    const data = {
        pluginName: document.getElementById('pluginName').value,
        discordId: document.getElementById('discordId').value,
        ipLimit: document.getElementById('ipLimit').value,
        validityDays: document.getElementById('validityDays').value,
        categoryId: document.getElementById('license-category').value // DODANO TO
    };

    try {
        const res = await fetch('/api/licenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('Dodano nową licencję!', 'success');
            licenseForm.reset();
            modalOverlay.classList.add('hidden');
            await renderLicenseList(); // Odśwież listę
        } else {
            const result = await res.json();
            showToast('Błąd: ' + (result.error || 'Serwer odrzucił dane'), 'error');
        }
    } catch (err) {
        showToast('Błąd połączenia z serwerem', 'error');
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
});

// Zastąp końcówkę swojego script.js tym:

    // Zamykanie modali przyciskami
    [closeModalBtn, cancelModalBtn].forEach(b => {
        if(b) b.onclick = () => modalOverlay.classList.add('hidden');
    });

    // Zamykanie modalu logów (dodaj ID w HTML lub użyj selektora)
    const closeLogsBtn = document.querySelector('#log-overlay button'); 
    if(closeLogsBtn) closeLogsBtn.onclick = () => logOverlay.classList.add('hidden');

    // Kliknięcie poza modalem zamyka go
    window.onclick = (event) => {
        if (event.target == modalOverlay) modalOverlay.classList.add('hidden');
        if (event.target == logOverlay) logOverlay.classList.add('hidden');
    };
let currentCategories = [];
let selectedCategoryId = null; // null = "WSZYSTKIE"

// Funkcje modala
function openCategoryModal() { document.getElementById('category-modal').classList.remove('hidden'); }
function closeCategoryModal() { document.getElementById('category-modal').classList.add('hidden'); }

async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        
        // Jeśli serwer zwróci błąd (np. 500), udajemy, że mamy pustą listę
        if (!res.ok) {
            console.warn("Serwer zwrócił błąd kategorii. Ustawiam pustą listę.");
            currentCategories = [];
            renderCategoriesUI();
            updateCategoryDropdown();
            return;
        }

        const data = await res.json();
        currentCategories = Array.isArray(data) ? data : [];
        
        renderCategoriesUI();
        updateCategoryDropdown();
    } catch (err) {
        console.error("Błąd sieci/fetch kategorii:", err);
        currentCategories = [];
    }
}

function renderCategoriesUI() {
    const container = document.getElementById('categories-container');
    if (!container) return; // Zabezpieczenie przed brakiem elementu
    
    container.innerHTML = '';

    // Przycisk WSZYSTKIE
    const allBtn = document.createElement('button');
    allBtn.className = `px-4 py-2 rounded-lg border text-sm font-bold flex items-center gap-2 transition ${selectedCategoryId === null ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-gray-500 hover:bg-white/5'}`;
    allBtn.innerHTML = `WSZYSTKIE`;
    allBtn.onclick = () => filterByCategory(null);
    container.appendChild(allBtn);

    // Dynamiczne kategorie - TERAZ BEZPIECZNE
    if (Array.isArray(currentCategories)) {
        currentCategories.forEach(cat => {
            const btn = document.createElement('button');
            const isActive = selectedCategoryId === cat.id;
            btn.className = `px-4 py-2 rounded-lg border text-sm font-bold flex items-center gap-2 transition ${isActive ? 'bg-primary-container/20 border-primary-container text-white' : 'bg-transparent border-white/5 text-gray-500 hover:bg-white/5'}`;
            btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">folder</span> ${cat.name}`;
            btn.onclick = () => filterByCategory(cat.id);
            container.appendChild(btn);
        });
    }
}

// Aktualizacja dropdownu w modalu tworzenia licencji
function updateCategoryDropdown() {
    const select = document.getElementById('license-category');
    select.innerHTML = '<option value="">Bez kategorii</option>';
    currentCategories.forEach(cat => {
        select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    });
}

// Tworzenie nowej kategorii
document.getElementById('add-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    const desc = document.getElementById('cat-desc').value;

    const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc })
    });

    if(res.ok) {
        closeCategoryModal();
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-desc').value = '';
        loadCategories(); // Odśwież listę
    }
});

// Filtrowanie licencji po kliknięciu w kategorię
function filterByCategory(categoryId) {
    selectedCategoryId = categoryId;
    renderCategoriesUI(); // Zaktualizuj kolory przycisków
    loadLicenses(); // Odśwież listę licencji (musisz dodać filtrowanie w samej funkcji renderującej listę)
}
    // Start
    if(addLicenseBtn) addLicenseBtn.onclick = () => modalOverlay.classList.remove('hidden');
    checkLoginStatus();
});
