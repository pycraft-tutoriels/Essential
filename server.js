const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const frontendUrl = 'https://essential-app-seven.vercel.app';

const app = express();

// Chemin du fichier utilisateurs
const USERS_FILE = path.join(__dirname, 'users.json');

const corsOptions = {
    origin: 'https://essential-app-seven.vercel.app', // L'URL de ton frontend Vercel
    optionsSuccessStatus: 200 // Pour les navigateurs hérités (IE11, divers SmartTVs)
};

// Middleware
app.use(cors({
    origin: frontendUrl,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Liste les méthodes HTTP que ton API utilise
    allowedHeaders: ['Content-Type', 'Authorization'], // Liste les en-têtes personnalisés que ton frontend pourrait envoyer
    credentials: true // Si tu utilises des cookies ou des sessions entre frontend/backend
}));
app.use(express.json()); // Permet à Express de parser les requêtes JSON

// --- Fonctions utilitaires pour lire/écrire les utilisateurs ---

// Lecture des utilisateurs depuis le fichier JSON
function readUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        // Si le fichier n'existe pas, on le crée avec un tableau vide
        fs.writeFileSync(USERS_FILE, '[]', 'utf-8');
    }
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    try {
        // Tente de parser les données en JSON
        return JSON.parse(data);
    } catch (e) {
        // En cas d'erreur de parsing (fichier corrompu par ex.), retourne un tableau vide
        console.error("Erreur lors du parsing de users.json:", e);
        return [];
    }
}

// Écriture des utilisateurs dans le fichier JSON
function writeUsers(users) {
    // Écrit le tableau d'utilisateurs formaté en JSON (indentation 2 pour la lisibilité)
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// --- Routes API ---

// Route d'inscription d'un nouvel utilisateur
app.post('/register', (req, res) => {
    const { email, password } = req.body;

    // Validation basique des entrées
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe sont requis.' });
    }

    const users = readUsers();

    // Vérifie si l'email est déjà utilisé
    if (users.find(u => u.email === email)) {
        return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    }

    // Ajoute le nouvel utilisateur avec des listes vides pour contacts, groupes et conversations
    users.push({
        email,
        password, // En production, le mot de passe devrait être hashé !
        contacts: [],
        groups: [],
        conversations: [] // Toutes les discussions (chats individuels et groupes)
    });
    writeUsers(users); // Sauvegarde la liste mise à jour des utilisateurs

    res.status(201).json({ message: 'Inscription réussie !' }); // 201 Created
});

// Route de connexion d'un utilisateur
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validation basique des entrées
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe sont requis.' });
    }

    const users = readUsers();
    // Recherche l'utilisateur correspondant à l'email et au mot de passe
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect.' }); // 401 Unauthorized
    }

    // Renvoie un message de succès et l'email de l'utilisateur pour le frontend
    res.json({ message: 'Connexion réussie !', userEmail: user.email });
});

// Route pour obtenir les données d'un utilisateur spécifique
app.get('/user/:email', (req, res) => {
    const email = req.params.email; // Récupère l'email depuis l'URL

    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé." }); // 404 Not Found
    }

    // Crée une copie de l'objet utilisateur et supprime le mot de passe pour la sécurité
    const { password, ...userData } = user;
    res.json(userData); // Renvoie les données de l'utilisateur (sans le mot de passe)
});

// Route pour mettre à jour les données d'un utilisateur (contacts, groupes, conversations)
app.put('/user/:email', (req, res) => {
    const email = req.params.email; // Récupère l'email depuis l'URL
    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === email); // Trouve l'index de l'utilisateur

    if (userIndex === -1) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Récupère les données à mettre à jour depuis le corps de la requête
    const { contacts, groups, conversations } = req.body;

    // Met à jour les propriétés si elles sont présentes dans la requête
    if (contacts) users[userIndex].contacts = contacts;
    if (groups) users[userIndex].groups = groups;
    if (conversations) users[userIndex].conversations = conversations;

    writeUsers(users); // Sauvegarde les modifications

    res.json({ message: "Données utilisateur mises à jour avec succès !" });
});

// Route : Création d'un nouveau chat individuel
app.post('/chats', (req, res) => {
    const { userId, name, identifier } = req.body;

    if (!userId || !name || !identifier) {
        return res.status(400).json({ error: 'Email utilisateur, nom du contact et identifiant sont requis.' });
    }

    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === userId);

    if (userIndex === -1) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newChat = {
        id: newChatId,
        name: name, // Nom du contact
        identifier: identifier, // ID ou numéro de téléphone du contact
        lastMessage: '', // Dernier message, vide au début
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), // Heure de création
        isGroup: false, // Indique que c'est un chat individuel
        isPriority: false, // Par défaut, non prioritaire
        messages: [] // Tableau pour stocker les messages de cette conversation
    };

    users[userIndex].conversations.push(newChat);
    writeUsers(users);

    res.status(201).json({ message: 'Chat créé avec succès !', newChat: newChat });
});

// Route : Création d'un nouveau groupe
app.post('/groups', (req, res) => {
    const { userId, name, members, endDate } = req.body;

    if (!userId || !name || !members || !Array.isArray(members) || !endDate) {
        return res.status(400).json({ error: 'Email utilisateur, nom du groupe, membres (tableau) et date de fin sont requis.' });
    }

    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === userId);

    if (userIndex === -1) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const newGroupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newGroup = {
        id: newGroupId,
        name: name, // Nom du groupe
        members: members, // Tableau des membres du groupe (ex: ['Alice', 'Bob'])
        endDate: endDate, // Date de fin du groupe (pour les groupes temporaires)
        lastMessage: '', // Dernier message, vide au début
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), // Heure de création
        isGroup: true, // Indique que c'est un groupe
        isPriority: false, // Par défaut, non prioritaire
        timer: 'N/A',
        messages: [] // Tableau pour stocker les messages de ce groupe
    };

    users[userIndex].conversations.push(newGroup);
    writeUsers(users);

    res.status(201).json({ message: 'Groupe créé avec succès !', newGroup: newGroup });
});

// --- ROUTE MODIFIÉE : Ajout d'un contact par e-mail ---
app.post('/contacts/add-by-email', (req, res) => { // Supprimez 'async' ici
    const { adderEmail, contactEmail, contactName } = req.body;

    if (!adderEmail || !contactEmail || !contactName) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (adderEmail === contactEmail) {
        return res.status(400).json({ error: 'Cannot add yourself as a contact.' });
    }

    try {
        const users = readUsers(); // Lisez tous les utilisateurs

        // 1. Trouver l'utilisateur actuel (celui qui ajoute le contact)
        const currentUserIndex = users.findIndex(u => u.email === adderEmail);
        if (currentUserIndex === -1) {
            return res.status(404).json({ error: 'Adding user not found.' });
        }
        const currentUser = users[currentUserIndex];

        // 2. Trouver l'utilisateur contact (celui à ajouter)
        const contactUserIndex = users.findIndex(u => u.email === contactEmail);
        if (contactUserIndex === -1) {
            return res.status(404).json({ error: 'Contact email not found in our system.' });
        }
        const contactUser = users[contactUserIndex];

        // 3. Vérifier si une conversation existe déjà entre eux
        // Nous allons parcourir les conversations de l'utilisateur actuel
        // et vérifier si une conversation individuelle inclut les deux participants.
        const existingConversation = currentUser.conversations.find(
            conv => !conv.isGroup &&
                    conv.participants && // Assurez-vous que 'participants' existe
                    conv.participants.includes(contactEmail) &&
                    conv.participants.includes(adderEmail)
        );
        if (existingConversation) {
            return res.status(409).json({ error: 'Conversation with this contact already exists.' });
        }

        // 4. Créer un nouvel ID de conversation
        const newConversationId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 5. Créer les nouveaux objets conversation
        const newConversationForAdder = {
            id: newConversationId,
            name: contactName, // Le nom que l'ajoutant choisit pour ce contact
            lastMessage: '',
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            isGroup: false,
            participants: [adderEmail, contactEmail], // Stocker les e-mails des participants
            messages: []
        };

        const newConversationForContact = {
            id: newConversationId, // Même ID pour les deux côtés de la conversation
            name: currentUser.email, // Le contact voit l'e-mail de l'ajoutant
            lastMessage: '',
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            isGroup: false,
            participants: [adderEmail, contactEmail],
            messages: []
        };

        // 6. Ajouter la nouvelle conversation aux listes de conversations des deux utilisateurs
        currentUser.conversations.push(newConversationForAdder);
        contactUser.conversations.push(newConversationForContact);

        // Mettre à jour les utilisateurs dans le tableau global et sauvegarder
        users[currentUserIndex] = currentUser;
        users[contactUserIndex] = contactUser;
        writeUsers(users); // Sauvegarde toutes les modifications

        res.status(201).json({ message: 'Contact added and chat created successfully!', newChat: newConversationForAdder });

    } catch (error) {
        console.error('Error adding contact:', error);
        res.status(500).json({ error: 'Server error during contact addition.' });
    }
});

// --- ROUTE MODIFIÉE : Mise à jour des données utilisateur ---
app.put('/user/:email', (req, res) => { // Supprimez 'async' ici
    const userEmail = decodeURIComponent(req.params.email);
    const { conversations } = req.body; // Récupère seulement 'conversations' pour cette route

    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === userEmail);

    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found.' });
    }

    try {
        // Met à jour la conversation uniquement si elle est fournie
        if (conversations) {
            users[userIndex].conversations = conversations;
        }
        writeUsers(users); // Sauvegarde les modifications

        res.status(200).json({ message: 'User data updated successfully.' });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ error: 'Server error updating user data.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
