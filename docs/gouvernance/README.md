# Gouvernance & Transformation — PROJECT RESILIENCE-ALPHA

Documents du pilier Gouvernance (sujet, section 3.5). Groupe G4. Rédaction : Timéo (Lead Transformation & PMO).

| Document | À quoi il sert | Date |
|---|---|---|
| [Architecture_Technique_Resilience-Alpha.pdf](Architecture_Technique_Resilience-Alpha.pdf) / [architecture.md](architecture.md) | **Architecture telle que construite (v3), lue dans le code** : schéma, 17 services, 5 réseaux, 21 flux, sécurité en place, écarts avec la cible, points d'attention | 21/10 |
| [Architecture_Cible_v2.1_Resilience-Alpha.pdf](Architecture_Cible_v2.1_Resilience-Alpha.pdf) / [architecture-cible-v2.1.md](architecture-cible-v2.1.md) | Architecture cible validée par le coach le 19/10 (13 conteneurs), référence pour les écarts | 19/10 |
| [Architecture_et_EBIOS_Resilience-Alpha.pdf](Architecture_et_EBIOS_Resilience-Alpha.pdf) | Version courte : schéma tel que construit + EBIOS simplifié | 21/10 |
| [Gouvernance_BIA_PCA-PRA_EBIOS_DORA_Resilience-Alpha.pdf](Gouvernance_BIA_PCA-PRA_EBIOS_DORA_Resilience-Alpha.pdf) / [gouvernance.md](gouvernance.md) | BIA, PCA/PRA, EBIOS RM ateliers 2 à 5, état des protections, NIS2/DORA, recommandations, avec les mesures réelles | 20/10 |
| [EBIOS_RM_Atelier1_Resilience-Alpha.pdf](EBIOS_RM_Atelier1_Resilience-Alpha.pdf) / [ebios-rm.md](ebios-rm.md) | EBIOS RM atelier 1 : valeurs métier, événements redoutés | 19/10 |
| [Plan_Workshop_Resilience-Alpha.pdf](Plan_Workshop_Resilience-Alpha.pdf) | Plan de projet : rôles, planning, rendus | 19/10 |

**À savoir :**
- L'architecture v3 décrit le code de `main` au 21/10 (commit 2016dc1). Le plan d'adressage détaillé reste [`docs/plan-adressage.md`](../plan-adressage.md) ; un écart est signalé (flux payment-api → auth, qui n'existe pas dans le code).
- Le dossier de gouvernance décrit l'état du code au 20/10. Plusieurs points qu'il signale ont été corrigés depuis (usurpation d'IP, simulate_failure, routes /waf protégées, service auth réel, base non publiée) : mise à jour prévue avant le rendu.
- Les mesures de reprise ont été prises sur un poste de développement : à refaire sur le PC Hôte.

**Pour l'assistant RAG :** les fichiers `.md` de ce dossier sont la base de connaissances de gouvernance. Le service `ai-api` doit les charger depuis le dépôt (copie dans l'image ou volume en lecture seule), pas par une copie manuelle dans le conteneur, qui disparaît au rebuild.
