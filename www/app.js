/* app.js */
// -- Database (IndexedDB) --
const DB_VERSION = 1;
const DB_NAME = 'AIWorkspaceDB';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files', { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveFileToDB(id, file, textContent) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ id, file, textContent });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getFileFromDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(tx.error);
    });
}

async function deleteFileFromDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// -- Estado --
let projects = JSON.parse(localStorage.getItem('ai_projects_v2')) || [];
let activeProjectId = localStorage.getItem('ai_activeProjectId_v2') || null;
let geminiApiKey = localStorage.getItem('ai_geminiApiKey_v2') || '';
let currentEditingNoteId = null;

// -- DOM Elements --
const projectListEl = document.getElementById('project-list');
const emptyStateEl = document.getElementById('empty-state');
const mainHeaderEl = document.getElementById('main-header');
const workspaceGridEl = document.getElementById('workspace-grid');
const currentProjectTitleEl = document.getElementById('current-project-title');

// Notas UI
const notesListView = document.getElementById('notes-list-view');
const noteEditorView = document.getElementById('note-editor-view');
const notesGrid = document.getElementById('notes-grid');
const createNoteBtn = document.getElementById('create-note-btn');
const backToNotesBtn = document.getElementById('back-to-notes-btn');
const noteTitleInput = document.getElementById('note-title-input');
const noteContentArea = document.getElementById('note-content-area');

// Archivos UI
const documentsListEl = document.getElementById('documents-list');
const fileUploadInput = document.getElementById('file-upload-input');
const uploadBtn = document.getElementById('upload-btn');

// Chat UI
const chatHistoryEl = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const apiKeyModal = document.getElementById('api-key-modal');
const apiKeyInput = document.getElementById('api-key-input');

// -- Utils --
function generateId() { return Math.random().toString(36).substr(2, 9); }
function saveProjects() { localStorage.setItem('ai_projects_v2', JSON.stringify(projects)); }
function getActiveProject() { return projects.find(p => p.id === activeProjectId); }

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

function showMobileWorkspace() {
    document.getElementById('mobile-header').style.display = 'flex';
    document.getElementById('bottom-tabs').style.display = 'flex';
}

function hideMobileWorkspace() {
    document.getElementById('mobile-header').style.display = 'none';
    document.getElementById('bottom-tabs').style.display = 'none';
}

function setActiveTab(tabName) {
    // Show/hide panels
    document.querySelectorAll('.panel').forEach(panel => {
        const panelTab = panel.getAttribute('data-tab');
        if (panelTab) {
            panel.classList.toggle('active-tab', panelTab === tabName);
        }
    });
    // Update tab btn state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === tabName);
    });
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('open');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
}

function init() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => setActiveTab(btn.getAttribute('data-target')));
    });
    // Hamburger
    document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
    document.getElementById('close-sidebar-btn').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
    // Mobile settings
    document.getElementById('mobile-settings-btn').addEventListener('click', () => {
        apiKeyInput.value = geminiApiKey;
        apiKeyModal.classList.add('active');
    });
    // Empty state button
    const emptyAddBtn = document.getElementById('empty-add-project-btn');
    if (emptyAddBtn) {
        emptyAddBtn.addEventListener('click', () => {
            document.getElementById('new-project-name').value = '';
            document.getElementById('new-project-modal').classList.add('active');
            setTimeout(() => document.getElementById('new-project-name').focus(), 100);
        });
    }

    renderProjectList();
    if (activeProjectId && getActiveProject()) {
        loadProject(activeProjectId);
    } else {
        emptyStateEl.style.display = 'flex';
    }
}

// -- Proyectos --
document.getElementById('add-project-btn').addEventListener('click', () => {
    document.getElementById('new-project-name').value = '';
    document.getElementById('new-project-modal').classList.add('active');
    setTimeout(() => document.getElementById('new-project-name').focus(), 100);
});

document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById(btn.dataset.modal).classList.remove('active');
    });
});

document.getElementById('new-project-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-project-name').value.trim();
    if (name) {
        const newProject = { id: generateId(), name, notes: [], documents: [], chat: [] };
        projects.push(newProject);
        saveProjects();
        renderProjectList();
        loadProject(newProject.id);
        document.getElementById('new-project-modal').classList.remove('active');
    }
});

currentProjectTitleEl.addEventListener('input', () => {
    const project = getActiveProject();
    if (project) {
        project.name = currentProjectTitleEl.textContent;
        saveProjects();
        renderProjectList();
    }
});

function renderProjectList() {
    projectListEl.innerHTML = '';
    projects.forEach(project => {
        const li = document.createElement('li');
        li.className = `project-item ${project.id === activeProjectId ? 'active' : ''}`;
        li.innerHTML = `
            <span>${project.name || 'Sin título'}</span>
            <button class="delete-btn" onclick="deleteProject(event, '${project.id}')" title="Eliminar proyecto"><i class='bx bx-trash'></i></button>
        `;
        li.addEventListener('click', () => loadProject(project.id));
        projectListEl.appendChild(li);
    });
}

window.deleteProject = async function(event, id) {
    event.stopPropagation();
    if (confirm('¿Eliminar esta página y todos sus datos de forma permanente?')) {
        const p = projects.find(x => x.id === id);
        if (p && p.documents) {
            for (let d of p.documents) await deleteFileFromDB(d.id);
        }
        projects = projects.filter(x => x.id !== id);
        saveProjects();
        if (activeProjectId === id) {
            activeProjectId = null;
            localStorage.removeItem('ai_activeProjectId_v2');
            emptyStateEl.style.display = 'flex';
            mainHeaderEl.style.display = 'none';
            workspaceGridEl.style.display = 'none';
            hideMobileWorkspace();
        }
        renderProjectList();
    }
};

function loadProject(id) {
    activeProjectId = id;
    localStorage.setItem('ai_activeProjectId_v2', id);
    renderProjectList();
    closeSidebar();
    
    const project = getActiveProject();
    if (!project) return;

    if (!project.notes) project.notes = [];
    if (!project.documents) project.documents = [];
    
    emptyStateEl.style.display = 'none';

    if (isMobile()) {
        // Mobile: hide desktop header, show mobile header + tabs
        mainHeaderEl.style.display = 'none';
        workspaceGridEl.style.display = 'flex';
        showMobileWorkspace();
        document.getElementById('mobile-project-name').textContent = project.name || 'Sin título';
        setActiveTab('notes');
    } else {
        // Desktop
        mainHeaderEl.style.display = 'block';
        workspaceGridEl.style.display = 'grid';
        hideMobileWorkspace();
    }

    currentProjectTitleEl.textContent = project.name;
    
    showNotesList();
    renderDocuments(project.documents);
    renderChat(project.chat);
}

// -- Notas --
createNoteBtn.addEventListener('click', () => {
    const project = getActiveProject();
    if (!project) return;
    const newNote = { id: generateId(), title: '', content: '' };
    project.notes.unshift(newNote); // prepend
    saveProjects();
    openNote(newNote.id);
});

function renderNotes() {
    const project = getActiveProject();
    notesGrid.innerHTML = '';
    
    if (!project.notes || project.notes.length === 0) {
        notesListView.style.textAlign = 'center';
        notesGrid.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; width:100%; grid-column: 1/-1;">No hay notas aún.</p>';
        return;
    }
    
    notesListView.style.textAlign = 'left';
    project.notes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'note-card';
        div.innerHTML = `
            <h3>${note.title || 'Nueva Nota'}</h3>
            <p>${note.content || 'Vacío...'}</p>
            <button class="del-note-btn" onclick="deleteNote(event, '${note.id}')" title="Borrar nota"><i class='bx bx-trash'></i></button>
        `;
        div.addEventListener('click', () => openNote(note.id));
        notesGrid.appendChild(div);
    });
}

function openNote(noteId) {
    currentEditingNoteId = noteId;
    const project = getActiveProject();
    const note = project.notes.find(n => n.id === noteId);
    if (!note) return;
    
    noteTitleInput.value = note.title || '';
    noteContentArea.value = note.content || '';
    
    notesListView.style.display = 'none';
    noteEditorView.style.display = 'flex';
    if (!note.title) noteTitleInput.focus();
}

backToNotesBtn.addEventListener('click', () => showNotesList());

let noteTimeout;
function saveCurrentNote() {
    const project = getActiveProject();
    if (project && currentEditingNoteId) {
        const note = project.notes.find(n => n.id === currentEditingNoteId);
        if (note) {
            note.title = noteTitleInput.value;
            note.content = noteContentArea.value;
            saveProjects();
        }
    }
}

[noteTitleInput, noteContentArea].forEach(el => {
    el.addEventListener('input', () => {
        clearTimeout(noteTimeout);
        noteTimeout = setTimeout(saveCurrentNote, 500);
    });
});

function showNotesList() {
    saveCurrentNote(); 
    currentEditingNoteId = null;
    notesListView.style.display = 'block';
    noteEditorView.style.display = 'none';
    renderNotes();
}

window.deleteNote = function(event, noteId) {
    event.stopPropagation();
    const project = getActiveProject();
    if (project && confirm('¿Eliminar esta nota?')) {
        project.notes = project.notes.filter(n => n.id !== noteId);
        saveProjects();
        renderNotes();
    }
}

// -- Documentos --
uploadBtn.addEventListener('click', () => fileUploadInput.click());

fileUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const project = getActiveProject();
    if (!project) return;
    
    uploadBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Subiendo...';
    
    try {
        let textContent = null;
        if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
            textContent = await file.text();
        }
        
        const id = generateId();
        await saveFileToDB(id, file, textContent);
        
        project.documents.push({ id, name: file.name, type: file.type, size: file.size });
        saveProjects();
        renderDocuments(project.documents);
    } catch (err) {
        console.error('Error al subir', err);
        alert('Hubo un error al subir el archivo');
    }
    
    fileUploadInput.value = '';
    uploadBtn.innerHTML = '<i class="bx bx-upload"></i> Subir archivo';
});

function renderDocuments(docs) {
    documentsListEl.innerHTML = '';
    if (!docs || docs.length === 0) {
        documentsListEl.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center;">No hay archivos asociados.</p>';
        return;
    }
    
    docs.forEach(doc => {
        const div = document.createElement('div');
        div.className = 'doc-item';
        div.innerHTML = `
            <div class="doc-item-info" onclick="downloadFile('${doc.id}')" title="Descargar ${doc.name}">
                <i class='bx bx-file'></i>
                <span>${doc.name}</span>
            </div>
            <button class="del-doc-btn" onclick="deleteDoc('${doc.id}')" title="Eliminar archivo"><i class='bx bx-trash'></i></button>
        `;
        documentsListEl.appendChild(div);
    });
}

window.downloadFile = async function(id) {
    try {
        const record = await getFileFromDB(id);
        if (!record || !record.file) return alert('Archivo no encontrado');
        const url = URL.createObjectURL(record.file);
        const a = document.createElement('a');
        a.href = url;
        a.download = record.file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(err) {
        console.error(err);
        alert("Error decargando archivo");
    }
}

window.deleteDoc = async function(id) {
    const project = getActiveProject();
    if (project && confirm('¿Eliminar archivo permanentemente?')) {
        project.documents = project.documents.filter(d => d.id !== id);
        saveProjects();
        await deleteFileFromDB(id);
        renderDocuments(project.documents);
    }
}

// -- CHAT IA --
document.getElementById('settings-btn').addEventListener('click', () => {
    apiKeyInput.value = geminiApiKey;
    apiKeyModal.classList.add('active');
});

document.getElementById('api-key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    geminiApiKey = apiKeyInput.value.trim();
    localStorage.setItem('ai_geminiApiKey_v2', geminiApiKey);
    apiKeyModal.classList.remove('active');
});

function renderChat(chat) {
    chatHistoryEl.innerHTML = '';
    if (!chat || chat.length === 0) {
        chatHistoryEl.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center; margin-top:1rem;">Empieza una conversación basándote en el contexto de tus notas y archivos subidos.</p>';
    } else {
        chat.forEach(msg => appendMessageToUI(msg.role, msg.content));
    }
    scrollToBottom();
}

function appendMessageToUI(role, content) {
    if (chatHistoryEl.querySelector('p')) chatHistoryEl.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    if (role === 'bot' && typeof marked !== 'undefined') {
        bubble.innerHTML = DOMPurify.sanitize(marked.parse(content));
    } else {
        bubble.textContent = content;
    }
    
    div.appendChild(bubble);
    chatHistoryEl.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    setTimeout(() => {
        const parent = chatHistoryEl.parentElement;
        if(parent) parent.scrollTop = parent.scrollHeight;
    }, 50);
}

// ============================
// FUNCTION CALLING DEFINITIONS
// ============================
const TOOLS = [{
    functionDeclarations: [
        {
            name: 'create_note',
            description: 'Crea una nueva nota en el proyecto actual con el título y contenido especificados.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING', description: 'Título de la nota' },
                    content: { type: 'STRING', description: 'Contenido de la nota en texto plano o Markdown' }
                },
                required: ['title', 'content']
            }
        },
        {
            name: 'update_note',
            description: 'Modifica una nota existente del proyecto. Usa list_notes para obtener el note_id correcto antes de actualizar.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    note_id: { type: 'STRING', description: 'ID único de la nota a modificar' },
                    title: { type: 'STRING', description: 'Nuevo título de la nota' },
                    content: { type: 'STRING', description: 'Nuevo contenido completo de la nota' }
                },
                required: ['note_id', 'title', 'content']
            }
        },
        {
            name: 'list_notes',
            description: 'Devuelve la lista de notas del proyecto con sus IDs, títulos y contenido para poder referenciarlas o modificarlas.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'search_web',
            description: 'Busca información actualizada en internet sobre cualquier tema. Úsala cuando el usuario pregunte sobre eventos recientes, noticias, datos actuales, precios, clima u otra información que pueda haber cambiado.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    query: { type: 'STRING', description: 'Consulta de búsqueda en Google. Sé específico y usa palabras clave relevantes.' }
                },
                required: ['query']
            }
        }
    ]
}];

// Execute a web search using Gemini's Google Search grounding
async function executeSearchWeb(query) {
    // Show a search chip while fetching
    const searchChip = document.createElement('div');
    searchChip.className = 'action-chip searching';
    searchChip.innerHTML = `<i class="bx bx-search-alt bx-tada"></i> Buscando: "${query}"`;
    chatHistoryEl.appendChild(searchChip);
    scrollToBottom();

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tools: [{ googleSearch: {} }],
                    contents: [{ role: 'user', parts: [{ text: query }] }]
                })
            }
        );
        const data = await response.json();
        searchChip.remove();

        if (!response.ok) {
            return { error: `Error al buscar: ${data.error?.message || 'desconocido'}` };
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        const resultText = parts.filter(p => p.text).map(p => p.text).join('');

        if (!resultText) return { error: 'No se encontraron resultados.' };

        appendActionChip(`🔍 Búsqueda completada: "${query}"`, null);
        return { result: resultText };
    } catch (err) {
        searchChip.remove();
        return { error: `Error de red al buscar: ${err.message}` };
    }
}

// Execute a function call requested by Gemini
async function executeFunctionCall(name, args) {
    const project = getActiveProject();
    if (!project) return { error: 'No hay proyecto activo.' };

    if (name === 'search_web') {
        return await executeSearchWeb(args.query || '');
    }

    if (name === 'list_notes') {
        const notes = (project.notes || []).map(n => ({ id: n.id, title: n.title || 'Sin título', content: n.content || '' }));
        return { notes, count: notes.length };
    }

    if (name === 'create_note') {
        const newNote = { id: generateId(), title: args.title || '', content: args.content || '' };
        project.notes.unshift(newNote);
        saveProjects();
        // Refresh UI if list view is visible
        if (notesListView.style.display !== 'none') renderNotes();
        // Show action chip in chat
        appendActionChip(`📝 Nota creada: "${newNote.title}"`, () => openNote(newNote.id));
        return { success: true, note_id: newNote.id, title: newNote.title };
    }

    if (name === 'update_note') {
        const note = (project.notes || []).find(n => n.id === args.note_id);
        if (!note) return { error: `No existe ninguna nota con ID "${args.note_id}".` };
        note.title = args.title !== undefined ? args.title : note.title;
        note.content = args.content !== undefined ? args.content : note.content;
        // If this note is open in the editor, refresh the UI
        if (currentEditingNoteId === note.id) {
            noteTitleInput.value = note.title;
            noteContentArea.value = note.content;
        }
        saveProjects();
        if (notesListView.style.display !== 'none') renderNotes();
        appendActionChip(`✏️ Nota actualizada: "${note.title}"`, () => openNote(note.id));
        return { success: true, note_id: note.id, title: note.title };
    }

    return { error: `Función desconocida: ${name}` };
}

// Render a clickable chip in the chat when the AI takes an action
function appendActionChip(label, onClick) {
    const chip = document.createElement('div');
    chip.className = 'action-chip';
    chip.textContent = label;
    if (onClick) chip.addEventListener('click', onClick);
    else chip.style.cursor = 'default';
    chatHistoryEl.appendChild(chip);
    scrollToBottom();
}

// -- CONTEXTO DE IA --
async function buildProjectContextString() {
    const project = getActiveProject();
    if (!project) return '';

    if (currentEditingNoteId) saveCurrentNote();

    let ctx = `Eres un asistente inteligente integrado en un workspace de proyectos personales.\n`;
    ctx += `PROYECTO ACTUAL: "${project.name || 'Sin título'}"\n\n`;
    ctx += `Tienes acceso a las siguientes herramientas:\n`;
    ctx += `- create_note, update_note, list_notes: para gestionar notas del proyecto.\n`;
    ctx += `- search_web: para buscar información ACTUALIZADA en internet (noticias, clima, precios, eventos recientes, etc.).\n\n`;
    ctx += `REGLAS IMPORTANTES:\n`;
    ctx += `- Cuando el usuario pida crear o actualizar una nota, USA las funciones de notas.\n`;
    ctx += `- Cuando el usuario pregunte sobre información actualizada, reciente o que pueda haber cambiado, USA search_web ANTES de responder.\n`;
    ctx += `- Puedes combinar herramientas: buscar en internet Y luego crear/actualizar una nota con el resultado.\n\n`;

    if (project.notes && project.notes.length > 0) {
        ctx += `--- NOTAS ACTUALES DEL PROYECTO ---\n`;
        project.notes.forEach(note => {
            ctx += `ID: ${note.id} | Título: "${note.title || 'Sin título'}"\n${note.content || '(Vacía)'}\n\n`;
        });
    } else {
        ctx += `El proyecto aún no tiene notas.\n\n`;
    }

    if (project.documents && project.documents.length > 0) {
        let docText = '';
        for (const doc of project.documents) {
            try {
                const record = await getFileFromDB(doc.id);
                if (record && record.textContent) docText += `Archivo "${doc.name}":\n${record.textContent}\n\n`;
            } catch (e) { /* ignore */ }
        }
        if (docText) ctx += `--- ARCHIVOS DE TEXTO ---\n${docText}`;
    }

    ctx += `Si el usuario pide información que está en sus notas o archivos, responde con esa información. Usa tu conocimiento general para lo demás. Sé conciso, útil y usa Markdown cuando sea relevante.`;
    return ctx;
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg || !activeProjectId) return;
    chatInput.value = '';
    if (!geminiApiKey) { apiKeyModal.classList.add('active'); return; }
    sendMessageToIA(msg);
});

async function callGeminiAPI(contents, systemInstruction) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemInstruction, tools: TOOLS, contents })
        }
    );
    return response;
}

async function sendMessageToIA(userContent) {
    const project = getActiveProject();
    if (!project) return;

    project.chat.push({ role: 'user', content: userContent });
    saveProjects();
    appendMessageToUI('user', userContent);

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-msg bot';
    typingDiv.id = typingId;
    typingDiv.innerHTML = '<div class="bubble"><i class="bx bx-loader-alt bx-spin"></i> Pensando...</div>';
    chatHistoryEl.appendChild(typingDiv);
    scrollToBottom();

    try {
        const sysContext = await buildProjectContextString();
        const sysInstruction = { parts: [{ text: sysContext }] };

        // Build API contents from chat history
        // We need to maintain the multi-turn conversation including function calls
        const apiContents = project.chat.slice(-20).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        let response = await callGeminiAPI(apiContents, sysInstruction);
        let data = await response.json();

        document.getElementById(typingId)?.remove();

        if (!response.ok) {
            console.error(data);
            if (data.error?.message?.includes('API key')) {
                appendMessageToUI('bot', 'Error: API Key de Gemini inválida. Revisa la configuración.');
                geminiApiKey = ''; localStorage.removeItem('ai_geminiApiKey_v2');
            } else {
                appendMessageToUI('bot', `Error de API: ${data.error?.message || 'Error desconocido'}`);
            }
            return;
        }

        // ---- Function calling loop ----
        // Gemini may return function calls instead of text. We process all of them.
        let loopContents = [...apiContents];
        let maxLoops = 5;
        let loopCount = 0;

        while (loopCount < maxLoops) {
            loopCount++;
            const candidate = data.candidates?.[0];
            if (!candidate) break;

            const parts = candidate.content?.parts || [];
            const functionCallParts = parts.filter(p => p.functionCall);
            const textParts = parts.filter(p => p.text);

            if (functionCallParts.length === 0) {
                // No function calls — it's a final text response
                const botText = textParts.map(p => p.text).join('');
                if (botText) {
                    project.chat.push({ role: 'bot', content: botText });
                    saveProjects();
                    appendMessageToUI('bot', botText);
                }
                break;
            }

            // Process all function calls
            // Add model's response (with function calls) to contents
            loopContents.push({ role: 'model', parts });

            // Show brief thinking chip
            const thinkingChip = document.createElement('div');
            thinkingChip.className = 'action-chip thinking';
            thinkingChip.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Ejecutando acciones...';
            chatHistoryEl.appendChild(thinkingChip);
            scrollToBottom();

            const functionResponses = await Promise.all(functionCallParts.map(async part => {
                const fnName = part.functionCall.name;
                const fnArgs = part.functionCall.args || {};
                const result = await executeFunctionCall(fnName, fnArgs);
                return {
                    functionResponse: {
                        name: fnName,
                        response: { content: result }
                    }
                };
            }));

            thinkingChip.remove();

            // Add function responses to contents
            loopContents.push({ role: 'user', parts: functionResponses });

            // Show typing again for next iteration
            const nextTypingDiv = document.createElement('div');
            const nextTypingId = 'typing-' + Date.now();
            nextTypingDiv.className = 'chat-msg bot';
            nextTypingDiv.id = nextTypingId;
            nextTypingDiv.innerHTML = '<div class="bubble"><i class="bx bx-loader-alt bx-spin"></i> Redactando respuesta...</div>';
            chatHistoryEl.appendChild(nextTypingDiv);
            scrollToBottom();

            // Call again
            response = await callGeminiAPI(loopContents, sysInstruction);
            data = await response.json();
            document.getElementById(nextTypingId)?.remove();

            if (!response.ok) {
                appendMessageToUI('bot', `Error al continuar: ${data.error?.message || 'Error'}`);
                break;
            }
        }

    } catch (err) {
        console.error(err);
        document.getElementById(typingId)?.remove();
        appendMessageToUI('bot', 'Error de red al conectar con Gemini. Revisa tu conexión.');
    }
}

init();
