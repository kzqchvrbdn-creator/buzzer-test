# Jeu buzzer rapidité

Application web pour organiser un jeu de questions-réponses avec buzzer.

## Fonctionnalités

- Interface joueur avec prénom et gros bouton buzzer.
- Interface admin sur `/admin`.
- Écran de diffusion sur `/screen`.
- Verrouillage automatique du premier joueur qui buzze.
- Gestion des manches.
- Gestion des questions, réponses et points par question.
- Contrôle de la musique de fond depuis l'admin.
- Ajout et retrait de points.
- Mise à jour en direct entre les joueurs et l'admin.
- Sauvegarde PostgreSQL si la variable `DATABASE_URL` est configurée.

## Lancer en local

```bash
node server.js
```

Puis ouvrir :

- Joueur : http://localhost:3000
- Admin : http://localhost:3000/admin
- Écran : http://localhost:3000/screen

## Déploiement

L'application utilise Node.js sans dépendance externe.

Commande de démarrage :

```bash
node server.js
```

Le serveur utilise automatiquement la variable d'environnement `PORT` fournie par l'hébergeur.

Sur Railway, ajoute un service PostgreSQL si tu veux conserver les questions et les scores après redémarrage. Railway fournira automatiquement `DATABASE_URL`.
