# Jeu buzzer rapidité

Application web pour organiser un jeu de questions-réponses avec buzzer.

## Fonctionnalités

- Interface joueur avec prénom et gros bouton buzzer.
- Interface admin sur `/admin`.
- Verrouillage automatique du premier joueur qui buzze.
- Gestion des manches.
- Ajout et retrait de points.
- Mise à jour en direct entre les joueurs et l'admin.

## Lancer en local

```bash
node server.js
```

Puis ouvrir :

- Joueur : http://localhost:3000
- Admin : http://localhost:3000/admin

## Déploiement

L'application utilise Node.js sans dépendance externe.

Commande de démarrage :

```bash
node server.js
```

Le serveur utilise automatiquement la variable d'environnement `PORT` fournie par l'hébergeur.
