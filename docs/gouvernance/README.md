# Gouvernance & Transformation — PROJECT RESILIENCE-ALPHA

Documents du pilier Gouvernance (sujet, section 3.5). Rédaction : Timéo (Lead Transformation & PMO).

| Document | À quoi il sert | Date |
|---|---|---|
| [Gouvernance_BIA_PCA-PRA_EBIOS_DORA_Resilience-Alpha.pdf](Gouvernance_BIA_PCA-PRA_EBIOS_DORA_Resilience-Alpha.pdf) | **Le plus à jour** : BIA, PCA/PRA, EBIOS RM ateliers 2 à 5, état réel des protections, NIS2/DORA, recommandations à la direction. Mesures réalisées sur la stack réelle | 20/10 |
| [gouvernance.md](gouvernance.md) | Même contenu en texte (pour l'assistant RAG) | 20/10 |
| [Architecture_Technique_Resilience-Alpha.pdf](Architecture_Technique_Resilience-Alpha.pdf) | Architecture cible v2.1 validée : schéma, conteneurs, flux, secrets SOPS, performances | 19/10 |
| [architecture.md](architecture.md) | Même contenu en texte | 19/10 |
| [Architecture_et_EBIOS_Resilience-Alpha.pdf](Architecture_et_EBIOS_Resilience-Alpha.pdf) | Version courte : schéma d'architecture + EBIOS simplifié | 19/10 |
| [EBIOS_RM_Atelier1_Resilience-Alpha.pdf](EBIOS_RM_Atelier1_Resilience-Alpha.pdf) / [ebios-rm.md](ebios-rm.md) | EBIOS RM atelier 1 : valeurs métier, événements redoutés | 19/10 |
| [Plan_Workshop_Resilience-Alpha.pdf](Plan_Workshop_Resilience-Alpha.pdf) | Plan de projet : rôles, planning, rendus | 19/10 |

**À savoir :**
- La colonne « Ce qui nous protège déjà » de l'EBIOS atelier 1 (19/10) est remplacée par la section 4 du dossier de gouvernance (20/10), qui donne l'état réel du code.
- L'architecture v2.1 décrit la cible validée (13 conteneurs). La stack construite compte 17 services : voir aussi [`docs/plan-adressage.md`](../plan-adressage.md).
- Les mesures de reprise (1,8 s, 0,4 s, 9,8 s, 90,5 %) ont été prises sur un poste de développement : à refaire sur le PC Hôte avant la soutenance.
- Remplacer `G<n>` par le numéro du groupe avant le rendu.

**Pour l'assistant RAG :** les fichiers `.md` de ce dossier sont la base de connaissances de gouvernance. Le service `ai-api` doit les charger depuis le dépôt (copie dans l'image ou volume en lecture seule), et non par une copie manuelle dans le conteneur, qui disparaît au rebuild.
