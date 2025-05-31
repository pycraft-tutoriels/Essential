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
// Cette route est générique et peut être utilisée par le frontend pour envoyer des maj complexes
app.put('/user/:email', (req, res) => {
    const email = req.params.email; // Récupère l'email depuis l'URL
    const users = readUsers();
    const userIndex = users.findIndex(u => u.email === email); // Trouve l'index de l'utilisateur

    if (userIndex === -1) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Récupère les données à mettre à jour depuis le corps de la requête
    // Permet de mettre à jour contacts, groups, conversations ou d'autres propriétés
    const updates = req.body;

    // Applique les mises à jour
    Object.keys(updates).forEach(key => {
        if (users[userIndex][key] !== undefined) { // Évite d'ajouter des propriétés non définies
            users[userIndex][key] = updates[key];
        }
    });

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

    // Génère un ID unique pour la nouvelle conversation
    const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newChatForInitiator = {
        id: newChatId,
        name: name, // Nom du contact tel que défini par l'initiateur
        identifier: identifier, // ID ou numéro de téléphone du contact (l'email de l'autre)
        lastMessage: '',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        isGroup: false,
        participants: [userId, identifier], // Les participants du chat
        messages: []
    };

    // Trouver l'utilisateur contact
    const contactUserIndex = users.findIndex(u => u.email === identifier);
    if (contactUserIndex === -1) {
        return res.status(404).json({ error: "Utilisateur contact non trouvé. Il doit exister pour créer un chat." });
    }

    const newChatForContact = {
        id: newChatId, // Utilise le même ID de conversation
        name: userId, // Le contact voit l'email de l'initiateur comme nom de la conversation
        identifier: userId, // L'identifiant de l'initiateur pour le contact
        lastMessage: '',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        isGroup: false,
        participants: [userId, identifier],
        messages: []
    };

    // Ajoute la nouvelle conversation aux deux utilisateurs
    users[userIndex].conversations.push(newChatForInitiator);
    users[contactUserIndex].conversations.push(newChatForContact);

    writeUsers(users);

    res.status(201).json({ message: 'Chat créé avec succès !', newChat: newChatForInitiator });
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
        lastMessage: '',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        isGroup: true, // Indique que c'est un groupe
        isPriority: false,
        timer: 'N/A',
        messages: [] // Tableau pour stocker les messages de ce groupe
    };

    // Ajoutez le groupe à l'utilisateur qui le crée
    users[userIndex].conversations.push(newGroup);

    // Ajoutez le groupe à tous les membres du groupe également
    // Assurez-vous que 'members' contient les emails des utilisateurs existants
    members.forEach(memberEmail => {
        const memberIndex = users.findIndex(u => u.email === memberEmail);
        if (memberIndex !== -1 && users[memberIndex].email !== userId) { // Évitez d'ajouter deux fois pour le créateur
            const existingGroup = users[memberIndex].conversations.find(conv => conv.id === newGroupId);
            if (!existingGroup) { // Ajoute seulement si le groupe n'est pas déjà présent
                users[memberIndex].conversations.push({
                    ...newGroup,
                    name: name // Le nom du groupe reste le même pour tous les membres
                });
            }
        }
    });

    writeUsers(users);

    res.status(201).json({ message: 'Groupe créé avec succès !', newGroup: newGroup });
});

// --- ROUTE MODIFIÉE : Ajout d'un contact par e-mail ---
app.post('/contacts/add-by-email', (req, res) => {
    const { adderEmail, contactEmail, contactName } = req.body;

    if (!adderEmail || !contactEmail || !contactName) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (adderEmail === contactEmail) {
        return res.status(400).json({ error: 'Cannot add yourself as a contact.' });
    }

    try {
        const users = readUsers();

        const currentUserIndex = users.findIndex(u => u.email === adderEmail);
        if (currentUserIndex === -1) {
            return res.status(404).json({ error: 'Adding user not found.' });
        }
        const currentUser = users[currentUserIndex];

        const contactUserIndex = users.findIndex(u => u.email === contactEmail);
        if (contactUserIndex === -1) {
            return res.status(404).json({ error: 'Contact email not found in our system.' });
        }
        const contactUser = users[contactUserIndex];

        // Vérifier si une conversation existe déjà entre eux (basé sur les participants et non-groupe)
        const existingConversation = currentUser.conversations.find(
            conv => !conv.isGroup &&
                    conv.participants &&
                    conv.participants.includes(contactEmail) &&
                    conv.participants.includes(adderEmail)
        );
        if (existingConversation) {
            return res.status(409).json({ error: 'Conversation with this contact already exists.' });
        }

        const newConversationId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const newConversationForAdder = {
            id: newConversationId,
            name: contactName,
            lastMessage: '',
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            isGroup: false,
            participants: [adderEmail, contactEmail], // Participants pour le chat individuel
            messages: []
        };

        const newConversationForContact = {
            id: newConversationId,
            name: currentUser.email, // L'autre personne voit l'email de celui qui l'a ajoutée
            lastMessage: '',
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            isGroup: false,
            participants: [adderEmail, contactEmail],
            messages: []
        };

        currentUser.conversations.push(newConversationForAdder);
        contactUser.conversations.push(newConversationForContact);

        users[currentUserIndex] = currentUser;
        users[contactUserIndex] = contactUser;
        writeUsers(users);

        res.status(201).json({ message: 'Contact added and chat created successfully!', newChat: newConversationForAdder });

    } catch (error) {
        console.error('Error adding contact:', error);
        res.status(500).json({ error: 'Server error during contact addition.' });
    }
});


// --- NOUVELLE ROUTE : Envoi de messages ---
app.post('/messages', (req, res) => {
    const { conversationId, senderEmail, content } = req.body;

    if (!conversationId || !senderEmail || !content) {
        return res.status(400).json({ error: 'ID de conversation, email de l\'expéditeur et contenu du message sont requis.' });
    }

    const users = readUsers();
    const messageTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender: senderEmail,
        content: content,
        time: messageTime
    };

    let conversationFound = false;

    // Parcourir tous les utilisateurs pour trouver la conversation par son ID et y ajouter le message
    users.forEach(user => {
        const convIndex = user.conversations.findIndex(c => c.id === conversationId);
        if (convIndex !== -1) {
            user.conversations[convIndex].messages.push(newMessage);
            user.conversations[convIndex].lastMessage = content; // Mettre à jour le dernier message
            user.conversations[convIndex].time = messageTime; // Mettre à jour l'heure du dernier message
            conversationFound = true;
        }
    });

    if (!conversationFound) {
        return res.status(404).json({ error: "Conversation non trouvée." });
    }

    writeUsers(users); // Sauvegarder toutes les mises à jour

    res.status(201).json({ message: 'Message envoyé avec succès !', newMessage: newMessage });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
