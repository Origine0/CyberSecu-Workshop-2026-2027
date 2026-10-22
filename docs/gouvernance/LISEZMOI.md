# Documents de gouvernance — PROJECT RESILIENCE-ALPHA

Rédaction : Timéo (Lead Transformation & PMO). Groupe G4.

| Dossier | Document | À quoi il sert | Date |
|---|---|---|---|
| 1_Plan_projet | Plan_Workshop_Resilience-Alpha.pdf | Qui fait quoi, planning jour par jour, rendus | 19/10 |
| 2_Architecture | **Architecture_Technique_Resilience-Alpha.pdf** | **Architecture telle que construite (v3.2), lue dans le code** : schéma corrigé (un cadre = un réseau Docker, secrets SOPS), 17 conteneurs, 5 réseaux, 23 flux, sécurité en place, écarts avec la cible, points d'attention | 22/10 |
| 2_Architecture | Architecture_Cible_v2.1_Resilience-Alpha.pdf | Architecture cible validée par le coach le 19/10 (13 conteneurs) : sert de référence pour les écarts | 19/10 |
| 2_Architecture | Architecture_et_EBIOS_Resilience-Alpha.pdf | Version courte : schéma tel que construit (v3.2) + EBIOS simplifié | 22/10 |
| 3_Risques_EBIOS | EBIOS_RM_Atelier1_Resilience-Alpha.pdf | EBIOS RM atelier 1 (valeurs métier, événements redoutés) | 19/10 |
| 4_Continuite_Conformite | Gouvernance_BIA_PCA-PRA_EBIOS_DORA_Resilience-Alpha.pdf | BIA, PCA/PRA, EBIOS ateliers 2 à 5, NIS2/DORA, recommandations, avec les mesures réelles | 21/10 |
| 5_Markdown_pour_RAG | architecture.md, architecture-cible-v2.1.md, ebios-rm.md, gouvernance.md | Mêmes contenus en texte, pour l'assistant RAG et le dépôt | 19-21/10 |

**Attention :**
- L'architecture v3.2 (22/10) décrit le code de `main` au commit fcb1ba6 : blocage du WAF rechargé à chaud, riposte graduée au flood, page /robot, assistant RAG hors ligne (procedures.pdf + knowledge/).
- Le dossier de gouvernance et l'architecture v3 décrivent le code de `main` au **21/10** (commit bd635b8, avec la boucle de réparation automatique), vérifié par des tests.
- Les mesures de reprise ont été prises sur un poste de développement : à refaire sur le PC Hôte.
