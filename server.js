const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Chemin du fichier utilisateurs
const USERS_FILE = path.join(__dirname, 'users.json');

// Middleware
app.use(cors()); // Permet les requêtes cross-origin (entre ton frontend et ton backend)
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
        groups: [], // Bien que les groupes soient maintenant dans 'conversations', garder 'groups' si nécessaire pour d'autres fonctionnalités
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

app.post('/chats', (req, res) => {
    // Attends userId (l'email de l'utilisateur connecté), name (nom du contact), contactEmail (e-mail du contact)
    const { userId, name, contactEmail } = req.body;

    if (!userId || !name || !contactEmail) {
        return res.status(400).json({ error: 'Email utilisateur, nom du contact et e-mail du contact sont requis.' });
    }

    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === userId);
    const contactIndex = users.findIndex(u => u.email === contactEmail);

    if (userIndex === -1) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }
    if (contactIndex === -1) {
        return res.status(404).json({ error: "Le contact avec cet e-mail n'existe pas." });
    }

    // Vérifie si une conversation existe déjà entre ces deux utilisateurs
    const alreadyExists = users[userIndex].conversations.some(conv =>
        !conv.isGroup &&
        ((conv.participants && conv.participants.includes(contactEmail)) ||
         (conv.identifier && conv.identifier === contactEmail))
    );
    if (alreadyExists) {
        return res.status(409).json({ error: "Une conversation existe déjà avec ce contact." });
    }

    // Génère un ID unique pour la nouvelle conversation
    const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Conversation pour l'utilisateur courant
    const newChat = {
        id: newChatId,
        name: name,
        identifier: contactEmail,
        participants: [userId, contactEmail],
        lastMessage: '',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        isGroup: false,
        isPriority: false,
        messages: []
    };

    // Conversation pour le contact (nommé avec l'email de l'utilisateur courant)
    const newChatForContact = {
        ...newChat,
        name: userId,
        identifier: userId,
        participants: [userId, contactEmail]
    };

    // Ajoute la conversation aux deux utilisateurs
    users[userIndex].conversations.push(newChat);
    users[contactIndex].conversations.push(newChatForContact);

    writeUsers(users);

    res.status(201).json({ message: 'Chat créé avec succès !', newChat: newChat });
});

app.post('/messages', (req, res) => {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) {
        return res.status(400).json({ error: "conversationId et message sont requis." });
    }

    const users = readUsers();
    let updated = false;

    // Pour chaque utilisateur, ajoute le message à la conversation correspondante si elle existe
    users.forEach(user => {
        const conv = user.conversations.find(c => c.id === conversationId);
        if (conv) {
            if (!conv.messages) conv.messages = [];
            conv.messages.push(message);
            conv.lastMessage = message.text;
            conv.time = message.timestamp;
            updated = true;
        }
    });

    if (updated) {
        writeUsers(users);
        res.json({ message: "Message envoyé à tous les participants." });
    } else {
        res.status(404).json({ error: "Conversation non trouvée." });
    }
});

// NOUVELLE ROUTE : Création d'un nouveau groupe
app.post('/groups', (req, res) => {
    // Attends userId (l'email de l'utilisateur connecté), name (nom du groupe), members (tableau de membres), endDate (date de fin)
    const { userId, name, members, endDate } = req.body;

    if (!userId || !name || !members || !Array.isArray(members) || !endDate) {
        return res.status(400).json({ error: 'Email utilisateur, nom du groupe, membres (tableau) et date de fin sont requis.' });
    }

    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === userId);

    if (userIndex === -1) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Génère un ID unique pour le nouveau groupe
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
        timer: 'N/A', // Sera calculé côté frontend ou si tu as une logique backend pour ça
        messages: [] // Tableau pour stocker les messages de ce groupe
    };

    // Ajoute le nouveau groupe au tableau 'conversations' de l'utilisateur
    users[userIndex].conversations.push(newGroup);
    writeUsers(users); // Sauvegarde les données mises à jour

    // Renvoie le nouveau groupe créé
    res.status(201).json({ message: 'Groupe créé avec succès !', newGroup: newGroup });
});


// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur backend démarré sur http://localhost:${PORT}`);
    console.log("Test log : le script est bien exécuté !");
});
