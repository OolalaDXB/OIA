export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          dedup_hash: string
          detail: string
          espace_id: string
          headline: string
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          next_action: string
          opportunity_id: string | null
          project_slug: string | null
          severity: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedup_hash: string
          detail?: string
          espace_id?: string
          headline: string
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          next_action?: string
          opportunity_id?: string | null
          project_slug?: string | null
          severity?: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedup_hash?: string
          detail?: string
          espace_id?: string
          headline?: string
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          next_action?: string
          opportunity_id?: string | null
          project_slug?: string | null
          severity?: number
        }
        Relationships: [
          {
            foreignKeyName: "alerts_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_appels_offres_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_appels_offres_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_clos_depuis_visite_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_fiche_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_fiche_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_financements_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_financements_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_investisseurs_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_investisseurs_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_rattachement_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_suggestions_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_toutes_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_toutes_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "watch_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          actor: string
          at: string
          auteur_origine: string | null
          email: string | null
          espace_id: string
          id: string
          id_origine: string | null
          import_id: string | null
          name: string
          note: string | null
          organisation: string | null
          phone: string | null
          project_slug: string | null
          record_id: string | null
          role: string | null
        }
        Insert: {
          actor: string
          at?: string
          auteur_origine?: string | null
          email?: string | null
          espace_id?: string
          id?: string
          id_origine?: string | null
          import_id?: string | null
          name: string
          note?: string | null
          organisation?: string | null
          phone?: string | null
          project_slug?: string | null
          record_id?: string | null
          role?: string | null
        }
        Update: {
          actor?: string
          at?: string
          auteur_origine?: string | null
          email?: string | null
          espace_id?: string
          id?: string
          id_origine?: string | null
          import_id?: string | null
          name?: string
          note?: string | null
          organisation?: string | null
          phone?: string | null
          project_slug?: string | null
          record_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      link_checks: {
        Row: {
          checked_at: string
          espace_id: string
          final_url: string | null
          http_code: number | null
          note: string
          status: string
          url: string
          where_found: string[]
        }
        Insert: {
          checked_at: string
          espace_id?: string
          final_url?: string | null
          http_code?: number | null
          note?: string
          status: string
          url: string
          where_found?: string[]
        }
        Update: {
          checked_at?: string
          espace_id?: string
          final_url?: string | null
          http_code?: number | null
          note?: string
          status?: string
          url?: string
          where_found?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "link_checks_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_lot: {
        Row: {
          annule_le: string | null
          charge_le: string
          empreinte: string
          espace_id: string
          id: string
          source: string
        }
        Insert: {
          annule_le?: string | null
          charge_le?: string
          empreinte: string
          espace_id: string
          id: string
          source: string
        }
        Update: {
          annule_le?: string | null
          charge_le?: string
          empreinte?: string
          espace_id?: string
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_lot_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_montant: {
        Row: {
          confiance: string | null
          devise: string | null
          espace_id: string
          lot_id: string | null
          opportunity_id: string
          source: string | null
          valeur: number | null
        }
        Insert: {
          confiance?: string | null
          devise?: string | null
          espace_id: string
          lot_id?: string | null
          opportunity_id: string
          source?: string | null
          valeur?: number | null
        }
        Update: {
          confiance?: string | null
          devise?: string | null
          espace_id?: string
          lot_id?: string | null
          opportunity_id?: string
          source?: string | null
          valeur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_montant_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "ml_lot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_appels_offres_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_appels_offres_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_clos_depuis_visite_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_fiche_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_fiche_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_financements_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_financements_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_investisseurs_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_investisseurs_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_rattachement_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_suggestions_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_toutes_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "ml_toutes_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_montant_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "watch_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          actor: string
          at: string
          auteur_origine: string | null
          espace_id: string
          id: string
          id_origine: string | null
          import_id: string | null
          project_slug: string | null
          record_id: string | null
          text: string
        }
        Insert: {
          actor: string
          at?: string
          auteur_origine?: string | null
          espace_id?: string
          id?: string
          id_origine?: string | null
          import_id?: string | null
          project_slug?: string | null
          record_id?: string | null
          text: string
        }
        Update: {
          actor?: string
          at?: string
          auteur_origine?: string | null
          espace_id?: string
          id?: string
          id_origine?: string | null
          import_id?: string | null
          project_slug?: string | null
          record_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_espace: {
        Row: {
          cree_le: string
          id: string
          nom: string
        }
        Insert: {
          cree_le?: string
          id: string
          nom: string
        }
        Update: {
          cree_le?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
      oia_ia_appel: {
        Row: {
          cout_max_usd: number
          cout_usd: number | null
          id: number
          jetons_entree: number | null
          jetons_sortie: number | null
          le: string
          modele: string | null
          mois: string
          motif: string | null
          nb_candidats: number | null
          outils: string[]
          regle_le: string | null
          service: string
          statut: string
          user_id: string | null
        }
        Insert: {
          cout_max_usd?: number
          cout_usd?: number | null
          id?: number
          jetons_entree?: number | null
          jetons_sortie?: number | null
          le?: string
          modele?: string | null
          mois: string
          motif?: string | null
          nb_candidats?: number | null
          outils?: string[]
          regle_le?: string | null
          service: string
          statut: string
          user_id?: string | null
        }
        Update: {
          cout_max_usd?: number
          cout_usd?: number | null
          id?: number
          jetons_entree?: number | null
          jetons_sortie?: number | null
          le?: string
          modele?: string | null
          mois?: string
          motif?: string | null
          nb_candidats?: number | null
          outils?: string[]
          regle_le?: string | null
          service?: string
          statut?: string
          user_id?: string | null
        }
        Relationships: []
      }
      oia_ia_budget: {
        Row: {
          alerte_usd: number
          depense_usd: number
          mois: string
          plafond_usd: number
          reserve_usd: number
        }
        Insert: {
          alerte_usd?: number
          depense_usd?: number
          mois: string
          plafond_usd?: number
          reserve_usd?: number
        }
        Update: {
          alerte_usd?: number
          depense_usd?: number
          mois?: string
          plafond_usd?: number
          reserve_usd?: number
        }
        Relationships: []
      }
      oia_ia_cout: {
        Row: {
          alerte_budget: boolean | null
          assistant: string | null
          cout_estime_mois_usd: number | null
          cout_estime_par_reponse_usd: number | null
          cout_retenu_mois_usd: number | null
          depense_budget_mois_usd: number | null
          espace_id: string
          fournisseur: string | null
          frequence: string | null
          marque_id: string | null
          mis_a_jour_le: string
          modele: string | null
          module: string
          mois: string
          nb_appels: number | null
          nb_questions: number | null
          nb_reponses: number | null
          nb_reponses_prevues: number | null
          plafond_mois_usd: number | null
          plafond_perimetre: string
          reserve_budget_mois_usd: number | null
          service: string
          seuil_alerte_usd: number | null
          source_cout: string
          statut_comptage: string
          suivi: boolean
          unite_volume: string
          version: string
          voie_acces: string
        }
        Insert: {
          alerte_budget?: boolean | null
          assistant?: string | null
          cout_estime_mois_usd?: number | null
          cout_estime_par_reponse_usd?: number | null
          cout_retenu_mois_usd?: number | null
          depense_budget_mois_usd?: number | null
          espace_id: string
          fournisseur?: string | null
          frequence?: string | null
          marque_id?: string | null
          mis_a_jour_le?: string
          modele?: string | null
          module: string
          mois: string
          nb_appels?: number | null
          nb_questions?: number | null
          nb_reponses?: number | null
          nb_reponses_prevues?: number | null
          plafond_mois_usd?: number | null
          plafond_perimetre: string
          reserve_budget_mois_usd?: number | null
          service: string
          seuil_alerte_usd?: number | null
          source_cout: string
          statut_comptage: string
          suivi: boolean
          unite_volume: string
          version?: string
          voie_acces: string
        }
        Update: {
          alerte_budget?: boolean | null
          assistant?: string | null
          cout_estime_mois_usd?: number | null
          cout_estime_par_reponse_usd?: number | null
          cout_retenu_mois_usd?: number | null
          depense_budget_mois_usd?: number | null
          espace_id?: string
          fournisseur?: string | null
          frequence?: string | null
          marque_id?: string | null
          mis_a_jour_le?: string
          modele?: string | null
          module?: string
          mois?: string
          nb_appels?: number | null
          nb_questions?: number | null
          nb_reponses?: number | null
          nb_reponses_prevues?: number | null
          plafond_mois_usd?: number | null
          plafond_perimetre?: string
          reserve_budget_mois_usd?: number | null
          service?: string
          seuil_alerte_usd?: number | null
          source_cout?: string
          statut_comptage?: string
          suivi?: boolean
          unite_volume?: string
          version?: string
          voie_acces?: string
        }
        Relationships: [
          {
            foreignKeyName: "oia_ia_cout_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_ia_facture: {
        Row: {
          espace_id: string
          fournisseur: string
          mois: string
          montant_usd: number
          note: string | null
          releve_le: string
          releve_par: string | null
        }
        Insert: {
          espace_id: string
          fournisseur: string
          mois: string
          montant_usd: number
          note?: string | null
          releve_le?: string
          releve_par?: string | null
        }
        Update: {
          espace_id?: string
          fournisseur?: string
          mois?: string
          montant_usd?: number
          note?: string | null
          releve_le?: string
          releve_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oia_ia_facture_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_import: {
        Row: {
          annule_le: string | null
          bilan: Json
          espace_id: string
          exporte_le: string | null
          id: string
          importe_le: string
          user_id: string
        }
        Insert: {
          annule_le?: string | null
          bilan?: Json
          espace_id: string
          exporte_le?: string | null
          id?: string
          importe_le?: string
          user_id: string
        }
        Update: {
          annule_le?: string | null
          bilan?: Json
          espace_id?: string
          exporte_le?: string | null
          id?: string
          importe_le?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oia_import_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_import_element: {
        Row: {
          cle: string
          empreinte: string
          import_id: string
          table_nom: string
        }
        Insert: {
          cle: string
          empreinte: string
          import_id: string
          table_nom: string
        }
        Update: {
          cle?: string
          empreinte?: string
          import_id?: string
          table_nom?: string
        }
        Relationships: [
          {
            foreignKeyName: "oia_import_element_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oia_import_element_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_journal: {
        Row: {
          action: string
          cible: string
          cible_id: string | null
          detail: Json
          espace_id: string
          id: number
          le: string
          user_id: string | null
        }
        Insert: {
          action: string
          cible: string
          cible_id?: string | null
          detail?: Json
          espace_id: string
          id?: number
          le?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          cible?: string
          cible_id?: string | null
          detail?: Json
          espace_id?: string
          id?: number
          le?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oia_journal_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_membre: {
        Row: {
          ajoute_le: string
          espace_id: string
          role: string
          user_id: string
        }
        Insert: {
          ajoute_le?: string
          espace_id: string
          role: string
          user_id: string
        }
        Update: {
          ajoute_le?: string
          espace_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oia_membre_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_projet: {
        Row: {
          actif: boolean
          charge_le: string
          decouverte_active: boolean
          empreinte: string
          espace_id: string
          exclusions: string[]
          geographies: string[]
          mots_cles: string[]
          natures_suivies: string[]
          nom: string
          profil: Json
          retire_du_registre_le: string | null
          revue_profil: string
          secteurs: string[]
          slug: string
          sources: Json
          statut: string
          type: string
          types_financement: string[]
          une_ligne: string
          url: string | null
        }
        Insert: {
          actif: boolean
          charge_le?: string
          decouverte_active?: boolean
          empreinte: string
          espace_id?: string
          exclusions?: string[]
          geographies?: string[]
          mots_cles?: string[]
          natures_suivies?: string[]
          nom: string
          profil?: Json
          retire_du_registre_le?: string | null
          revue_profil: string
          secteurs?: string[]
          slug: string
          sources?: Json
          statut: string
          type: string
          types_financement?: string[]
          une_ligne?: string
          url?: string | null
        }
        Update: {
          actif?: boolean
          charge_le?: string
          decouverte_active?: boolean
          empreinte?: string
          espace_id?: string
          exclusions?: string[]
          geographies?: string[]
          mots_cles?: string[]
          natures_suivies?: string[]
          nom?: string
          profil?: Json
          retire_du_registre_le?: string | null
          revue_profil?: string
          secteurs?: string[]
          slug?: string
          sources?: Json
          statut?: string
          type?: string
          types_financement?: string[]
          une_ligne?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oia_projet_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_visite: {
        Row: {
          derniere: string
          espace_id: string
          module: string
          precedente: string | null
          user_id: string
        }
        Insert: {
          derniere: string
          espace_id: string
          module?: string
          precedente?: string | null
          user_id: string
        }
        Update: {
          derniere?: string
          espace_id?: string
          module?: string
          precedente?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oia_visite_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      project_drafts: {
        Row: {
          applied_at: string | null
          applied_commit: string | null
          created_at: string
          created_by: string
          entry: Json
          error: string | null
          espace_id: string
          slug: string
          status: string
        }
        Insert: {
          applied_at?: string | null
          applied_commit?: string | null
          created_at?: string
          created_by?: string
          entry: Json
          error?: string | null
          espace_id?: string
          slug: string
          status?: string
        }
        Update: {
          applied_at?: string | null
          applied_commit?: string | null
          created_at?: string
          created_by?: string
          entry?: Json
          error?: string | null
          espace_id?: string
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_drafts_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tags: {
        Row: {
          actor: string
          at: string
          espace_id: string
          import_id: string | null
          project_slug: string
          record_id: string
        }
        Insert: {
          actor: string
          at?: string
          espace_id?: string
          import_id?: string | null
          project_slug: string
          record_id: string
        }
        Update: {
          actor?: string
          at?: string
          espace_id?: string
          import_id?: string | null
          project_slug?: string
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tags_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tags_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tags_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          error: string | null
          espace_id: string
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["request_kind"]
          payload: Json
          requested_at: string
          requested_by: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          error?: string | null
          espace_id?: string
          finished_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["request_kind"]
          payload?: Json
          requested_at?: string
          requested_by?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          error?: string | null
          espace_id?: string
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          payload?: Json
          requested_at?: string
          requested_by?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "requests_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          action: string
          actor: string
          at: string
          auteur_origine: string | null
          comment: string
          espace_id: string
          gate_pursue_eligible_at_decision: boolean
          id: string
          id_origine: string | null
          import_id: string | null
          record_id: string
        }
        Insert: {
          action: string
          actor: string
          at?: string
          auteur_origine?: string | null
          comment?: string
          espace_id?: string
          gate_pursue_eligible_at_decision: boolean
          id?: string
          id_origine?: string | null
          import_id?: string | null
          record_id: string
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          auteur_origine?: string | null
          comment?: string
          espace_id?: string
          gate_pursue_eligible_at_decision?: boolean
          id?: string
          id_origine?: string | null
          import_id?: string | null
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          auteur_origine: string | null
          created_at: string
          espace_id: string
          filters: Json
          id: string
          id_origine: string | null
          import_id: string | null
          kind: string
          name: string
          sort_direction: string
          sort_field: string
        }
        Insert: {
          auteur_origine?: string | null
          created_at?: string
          espace_id?: string
          filters?: Json
          id?: string
          id_origine?: string | null
          import_id?: string | null
          kind?: string
          name: string
          sort_direction?: string
          sort_field?: string
        }
        Update: {
          auteur_origine?: string | null
          created_at?: string
          espace_id?: string
          filters?: Json
          id?: string
          id_origine?: string | null
          import_id?: string | null
          kind?: string
          name?: string
          sort_direction?: string
          sort_field?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      shy_brouillon: {
        Row: {
          contenu: string
          conversation_id: string | null
          cree_le: string
          id: string
          statut: string
          titre: string
          type: string
          user_id: string
        }
        Insert: {
          contenu: string
          conversation_id?: string | null
          cree_le?: string
          id?: string
          statut?: string
          titre: string
          type: string
          user_id: string
        }
        Update: {
          contenu?: string
          conversation_id?: string | null
          cree_le?: string
          id?: string
          statut?: string
          titre?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shy_brouillon_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "shy_conversation"
            referencedColumns: ["id"]
          },
        ]
      }
      shy_contexte: {
        Row: {
          contenu: string
          cree_le: string
          id: string
          source: string
          statut: string
          type: string
          user_id: string
        }
        Insert: {
          contenu: string
          cree_le?: string
          id?: string
          source: string
          statut?: string
          type: string
          user_id: string
        }
        Update: {
          contenu?: string
          cree_le?: string
          id?: string
          source?: string
          statut?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      shy_conversation: {
        Row: {
          cree_le: string
          id: string
          maj_le: string
          titre: string
          user_id: string
        }
        Insert: {
          cree_le?: string
          id?: string
          maj_le?: string
          titre?: string
          user_id: string
        }
        Update: {
          cree_le?: string
          id?: string
          maj_le?: string
          titre?: string
          user_id?: string
        }
        Relationships: []
      }
      shy_journal: {
        Row: {
          acteur: string
          cible: string | null
          id: number
          le: string
          quoi: string
          resultat: string
          user_id: string
        }
        Insert: {
          acteur: string
          cible?: string | null
          id?: number
          le?: string
          quoi: string
          resultat: string
          user_id: string
        }
        Update: {
          acteur?: string
          cible?: string | null
          id?: number
          le?: string
          quoi?: string
          resultat?: string
          user_id?: string
        }
        Relationships: []
      }
      shy_message: {
        Row: {
          contenu: string
          conversation_id: string
          id: number
          le: string
          role: string
          sources: Json
          user_id: string
        }
        Insert: {
          contenu: string
          conversation_id: string
          id?: number
          le?: string
          role: string
          sources?: Json
          user_id: string
        }
        Update: {
          contenu?: string
          conversation_id?: string
          id?: number
          le?: string
          role?: string
          sources?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shy_message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "shy_conversation"
            referencedColumns: ["id"]
          },
        ]
      }
      shy_oubli: {
        Row: {
          empreinte: string
          id: number
          le: string
          quoi: string
          user_id: string
        }
        Insert: {
          empreinte: string
          id?: number
          le?: string
          quoi: string
          user_id: string
        }
        Update: {
          empreinte?: string
          id?: number
          le?: string
          quoi?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actor: string
          at: string
          auteur_origine: string | null
          completed_at: string | null
          due: string | null
          espace_id: string
          id: string
          id_origine: string | null
          import_id: string | null
          project_slug: string | null
          record_id: string | null
          status: string
          title: string
        }
        Insert: {
          actor: string
          at?: string
          auteur_origine?: string | null
          completed_at?: string | null
          due?: string | null
          espace_id?: string
          id?: string
          id_origine?: string | null
          import_id?: string | null
          project_slug?: string | null
          record_id?: string | null
          status?: string
          title: string
        }
        Update: {
          actor?: string
          at?: string
          auteur_origine?: string | null
          completed_at?: string | null
          due?: string | null
          espace_id?: string
          id?: string
          id_origine?: string | null
          import_id?: string | null
          project_slug?: string | null
          record_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_events: {
        Row: {
          at: string
          detail: Json
          espace_id: string
          event_type: Database["public"]["Enums"]["watch_event_type"]
          id: number
          opportunity_id: string
          run_id: string | null
        }
        Insert: {
          at?: string
          detail?: Json
          espace_id?: string
          event_type: Database["public"]["Enums"]["watch_event_type"]
          id?: number
          opportunity_id: string
          run_id?: string | null
        }
        Update: {
          at?: string
          detail?: Json
          espace_id?: string
          event_type?: Database["public"]["Enums"]["watch_event_type"]
          id?: number
          opportunity_id?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_events_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_appels_offres_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_appels_offres_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_clos_depuis_visite_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_fiche_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_fiche_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_financements_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_financements_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_investisseurs_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_investisseurs_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_rattachement_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_suggestions_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_toutes_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ml_toutes_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "watch_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_opportunities: {
        Row: {
          content_fingerprint: string
          deadline_at: string | null
          disappeared_at: string | null
          discovered_for: string[]
          espace_id: string
          first_seen_at: string
          gate_failed_reasons: string[]
          gate_pursue_eligible: boolean
          id: string
          info_confidence: number
          issuer: string
          last_seen_at: string
          lot_initial: string | null
          official_url: string | null
          opportunity_kind: string | null
          payload: Json
          recommendation: string
          record_id: string
          times_seen: number
          title: string
          verification_status: string
          watch_key: string
        }
        Insert: {
          content_fingerprint: string
          deadline_at?: string | null
          disappeared_at?: string | null
          discovered_for?: string[]
          espace_id?: string
          first_seen_at?: string
          gate_failed_reasons?: string[]
          gate_pursue_eligible?: boolean
          id?: string
          info_confidence?: number
          issuer: string
          last_seen_at?: string
          lot_initial?: string | null
          official_url?: string | null
          opportunity_kind?: string | null
          payload: Json
          recommendation: string
          record_id: string
          times_seen?: number
          title: string
          verification_status: string
          watch_key: string
        }
        Update: {
          content_fingerprint?: string
          deadline_at?: string | null
          disappeared_at?: string | null
          discovered_for?: string[]
          espace_id?: string
          first_seen_at?: string
          gate_failed_reasons?: string[]
          gate_pursue_eligible?: boolean
          id?: string
          info_confidence?: number
          issuer?: string
          last_seen_at?: string
          lot_initial?: string | null
          official_url?: string | null
          opportunity_kind?: string | null
          payload?: Json
          recommendation?: string
          record_id?: string
          times_seen?: number
          title?: string
          verification_status?: string
          watch_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_opportunities_lot_initial_fkey"
            columns: ["lot_initial"]
            isOneToOne: false
            referencedRelation: "ml_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_runs: {
        Row: {
          disappeared_count: number
          espace_id: string
          finished_at: string | null
          id: string
          new_count: number
          projects: string[]
          records_seen: number
          report: Json
          source: string
          started_at: string
          updated_count: number
        }
        Insert: {
          disappeared_count?: number
          espace_id?: string
          finished_at?: string | null
          id?: string
          new_count?: number
          projects?: string[]
          records_seen?: number
          report?: Json
          source: string
          started_at?: string
          updated_count?: number
        }
        Update: {
          disappeared_count?: number
          espace_id?: string
          finished_at?: string | null
          id?: string
          new_count?: number
          projects?: string[]
          records_seen?: number
          report?: Json
          source?: string
          started_at?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "watch_runs_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ml_appels_offres_v1: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_montant: string | null
          decide_le: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          emetteur: string | null
          espace_id: string | null
          gate_ok: boolean | null
          id: string | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          raisons_gate: string[] | null
          recommandation: string | null
          record_id: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          url_officielle: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_appels_offres_v2: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_information: number | null
          confiance_montant: string | null
          decide_le: string | null
          decide_par: string | null
          decide_par_origine: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          echeance_plus_tardive: string | null
          emetteur: string | null
          espace_id: string | null
          fraicheur: string | null
          gate_ok: boolean | null
          gate_ok_source: boolean | null
          id: string | null
          jours_restants: number | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          publie_le: string | null
          raisons_gate: string[] | null
          recommandation: string | null
          recommandation_source: string | null
          record_id: string | null
          route_strategique: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          type_avis: string | null
          url_officielle: string | null
          verdict_analyste: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_aujourdhui_v1: {
        Row: {
          echeance: string | null
          espace_id: string | null
          projet: string | null
          raison: string | null
          record_id: string | null
          reference: string | null
          titre: string | null
        }
        Relationships: []
      }
      ml_aujourdhui_v2: {
        Row: {
          echeance: string | null
          espace_id: string | null
          horizon: number | null
          jours_restants: number | null
          ordre: number | null
          projet: string | null
          raison: string | null
          record_id: string | null
          reference: string | null
          titre: string | null
        }
        Relationships: []
      }
      ml_avis_v1: {
        Row: {
          action: string | null
          auteur: string | null
          auteur_origine: string | null
          commentaire: string | null
          espace_id: string | null
          gate_ok_au_moment: boolean | null
          id: string | null
          id_origine: string | null
          import_id: string | null
          le: string | null
          record_id: string | null
        }
        Insert: {
          action?: string | null
          auteur?: string | null
          auteur_origine?: string | null
          commentaire?: string | null
          espace_id?: string | null
          gate_ok_au_moment?: boolean | null
          id?: string | null
          id_origine?: string | null
          import_id?: string | null
          le?: string | null
          record_id?: string | null
        }
        Update: {
          action?: string | null
          auteur?: string | null
          auteur_origine?: string | null
          commentaire?: string | null
          espace_id?: string | null
          gate_ok_au_moment?: boolean | null
          id?: string | null
          id_origine?: string | null
          import_id?: string | null
          le?: string | null
          record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_brouillons_projet_v1: {
        Row: {
          applique_le: string | null
          commit_applique: string | null
          contenu: Json | null
          cree_le: string | null
          cree_par: string | null
          erreur: string | null
          espace_id: string | null
          slug: string | null
          statut: string | null
        }
        Insert: {
          applique_le?: string | null
          commit_applique?: string | null
          contenu?: Json | null
          cree_le?: string | null
          cree_par?: string | null
          erreur?: string | null
          espace_id?: string | null
          slug?: string | null
          statut?: string | null
        }
        Update: {
          applique_le?: string | null
          commit_applique?: string | null
          contenu?: Json | null
          cree_le?: string | null
          cree_par?: string | null
          erreur?: string | null
          espace_id?: string | null
          slug?: string | null
          statut?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_drafts_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_clos_depuis_visite_v1: {
        Row: {
          decision_humaine: string | null
          depuis: string | null
          echeance: string | null
          espace_id: string | null
          id: string | null
          projet_etiquete: string | null
          record_id: string | null
          titre: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_contacts_v1: {
        Row: {
          auteur: string | null
          auteur_origine: string | null
          cree_le: string | null
          email: string | null
          espace_id: string | null
          id: string | null
          import_id: string | null
          nom: string | null
          note: string | null
          organisation: string | null
          projet: string | null
          record_id: string | null
          role: string | null
          telephone: string | null
        }
        Insert: {
          auteur?: string | null
          auteur_origine?: string | null
          cree_le?: string | null
          email?: string | null
          espace_id?: string | null
          id?: string | null
          import_id?: string | null
          nom?: string | null
          note?: string | null
          organisation?: string | null
          projet?: string | null
          record_id?: string | null
          role?: string | null
          telephone?: string | null
        }
        Update: {
          auteur?: string | null
          auteur_origine?: string | null
          cree_le?: string | null
          email?: string | null
          espace_id?: string | null
          id?: string | null
          import_id?: string | null
          nom?: string | null
          note?: string | null
          organisation?: string | null
          projet?: string | null
          record_id?: string | null
          role?: string | null
          telephone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_decision_v1: {
        Row: {
          decide_le: string | null
          decide_par: string | null
          decision: string | null
          espace_id: string | null
          record_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_decision_v2: {
        Row: {
          auteur_origine: string | null
          decide_le: string | null
          decide_par: string | null
          decision: string | null
          espace_id: string | null
          gate_ok_au_moment: boolean | null
          record_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_demandes_v1: {
        Row: {
          charge: Json | null
          commencee_le: string | null
          demande_le: string | null
          demande_par: string | null
          erreur: string | null
          espace_id: string | null
          id: string | null
          resultat: Json | null
          statut: string | null
          terminee_le: string | null
          type: string | null
        }
        Insert: {
          charge?: Json | null
          commencee_le?: string | null
          demande_le?: string | null
          demande_par?: string | null
          erreur?: string | null
          espace_id?: string | null
          id?: string | null
          resultat?: Json | null
          statut?: never
          terminee_le?: string | null
          type?: never
        }
        Update: {
          charge?: Json | null
          commencee_le?: string | null
          demande_le?: string | null
          demande_par?: string | null
          erreur?: string | null
          espace_id?: string | null
          id?: string | null
          resultat?: Json | null
          statut?: never
          terminee_le?: string | null
          type?: never
        }
        Relationships: [
          {
            foreignKeyName: "requests_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_fiche_v1: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_montant: string | null
          decide_le: string | null
          decision_humaine: string | null
          decisions: Json | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          emetteur: string | null
          espace_id: string | null
          gate_ok: boolean | null
          id: string | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          notes: Json | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          raisons_gate: string[] | null
          recommandation: string | null
          record_id: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          source: Json | null
          statut_verification: string | null
          taches: Json | null
          titre: string | null
          url_officielle: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_fiche_v2: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_information: number | null
          confiance_montant: string | null
          decide_le: string | null
          decide_par: string | null
          decide_par_origine: string | null
          decision_humaine: string | null
          decisions: Json | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          echeance_plus_tardive: string | null
          emetteur: string | null
          espace_id: string | null
          fraicheur: string | null
          gate_ok: boolean | null
          gate_ok_source: boolean | null
          id: string | null
          jours_restants: number | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          notes: Json | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          publie_le: string | null
          raisons_gate: string[] | null
          recommandation: string | null
          recommandation_source: string | null
          record_id: string | null
          route_strategique: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          source: Json | null
          statut_verification: string | null
          taches: Json | null
          titre: string | null
          type_avis: string | null
          url_officielle: string | null
          verdict_analyste: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_financements_v1: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_montant: string | null
          decide_le: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          emetteur: string | null
          espace_id: string | null
          gate_ok: boolean | null
          id: string | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          raisons_gate: string[] | null
          recommandation: string | null
          record_id: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          url_officielle: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_financements_v2: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_information: number | null
          confiance_montant: string | null
          decide_le: string | null
          decide_par: string | null
          decide_par_origine: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          echeance_plus_tardive: string | null
          emetteur: string | null
          espace_id: string | null
          fraicheur: string | null
          gate_ok: boolean | null
          gate_ok_source: boolean | null
          id: string | null
          jours_restants: number | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          publie_le: string | null
          raisons_gate: string[] | null
          recommandation: string | null
          recommandation_source: string | null
          record_id: string | null
          route_strategique: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          type_avis: string | null
          url_officielle: string | null
          verdict_analyste: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_imports_v1: {
        Row: {
          actif: boolean | null
          annule_le: string | null
          bilan: Json | null
          espace_id: string | null
          exporte_le: string | null
          id: string | null
          importe_le: string | null
          importe_par: string | null
        }
        Insert: {
          actif?: never
          annule_le?: string | null
          bilan?: Json | null
          espace_id?: string | null
          exporte_le?: string | null
          id?: string | null
          importe_le?: string | null
          importe_par?: string | null
        }
        Update: {
          actif?: never
          annule_le?: string | null
          bilan?: Json | null
          espace_id?: string | null
          exporte_le?: string | null
          id?: string | null
          importe_le?: string | null
          importe_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oia_import_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_indicateurs_montants_v1: {
        Row: {
          bloquees: number | null
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          closes_sous_14_jours: number | null
          devise: string | null
          espace_id: string | null
          montants_peu_surs: number | null
          opportunites: number | null
          portee: string | null
          pretes: number | null
          projet: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          somme_bloquees: number | null
          somme_connue: number | null
          somme_pretes: number | null
          verifie_par_humain: boolean | null
        }
        Relationships: []
      }
      ml_indicateurs_repartition_v1: {
        Row: {
          axe: string | null
          espace_id: string | null
          opportunites: number | null
          portee: string | null
          projet: string | null
          valeur: string | null
        }
        Relationships: []
      }
      ml_indicateurs_v1: {
        Row: {
          a_trier: number | null
          a_verifier: number | null
          actives: number | null
          approuvees: number | null
          approuvees_bloquees: number | null
          avec_montant: number | null
          bloquees: number | null
          closes_sous_14_jours: number | null
          derniere_veille: string | null
          espace_id: string | null
          etiquetees: number | null
          expirees: number | null
          montants_peu_surs: number | null
          opportunites: number | null
          portee: string | null
          pretes: number | null
          projet: string | null
          rejetees: number | null
          sans_echeance: number | null
          sans_montant: number | null
          sortantes: number | null
          verifiees: number | null
        }
        Relationships: []
      }
      ml_investisseurs_v1: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_montant: string | null
          decide_le: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          emetteur: string | null
          espace_id: string | null
          gate_ok: boolean | null
          id: string | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          raisons_gate: string[] | null
          recommandation: string | null
          record_id: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          url_officielle: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_investisseurs_v2: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_information: number | null
          confiance_montant: string | null
          decide_le: string | null
          decide_par: string | null
          decide_par_origine: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          echeance_plus_tardive: string | null
          emetteur: string | null
          espace_id: string | null
          fraicheur: string | null
          gate_ok: boolean | null
          gate_ok_source: boolean | null
          id: string | null
          jours_restants: number | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          publie_le: string | null
          raisons_gate: string[] | null
          recommandation: string | null
          recommandation_source: string | null
          record_id: string | null
          route_strategique: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          type_avis: string | null
          url_officielle: string | null
          verdict_analyste: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_liens_v1: {
        Row: {
          code_http: number | null
          espace_id: string | null
          note: string | null
          statut: string | null
          trouve_dans: string[] | null
          url: string | null
          url_finale: string | null
          verifie_le: string | null
        }
        Insert: {
          code_http?: number | null
          espace_id?: string | null
          note?: string | null
          statut?: string | null
          trouve_dans?: string[] | null
          url?: string | null
          url_finale?: string | null
          verifie_le?: string | null
        }
        Update: {
          code_http?: number | null
          espace_id?: string | null
          note?: string | null
          statut?: string | null
          trouve_dans?: string[] | null
          url?: string | null
          url_finale?: string | null
          verifie_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_checks_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_montants_v1: {
        Row: {
          avec_montant: number | null
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          devise: string | null
          espace_id: string | null
          montants_peu_surs: number | null
          opportunites: number | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          somme_connue: number | null
          verifie_par_humain: boolean | null
        }
        Relationships: []
      }
      ml_montants_v2: {
        Row: {
          avec_montant: number | null
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          devise: string | null
          espace_id: string | null
          montants_peu_surs: number | null
          opportunites: number | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          somme_connue: number | null
          verifie_par_humain: boolean | null
        }
        Relationships: []
      }
      ml_notes_v1: {
        Row: {
          auteur: string | null
          auteur_origine: string | null
          cree_le: string | null
          espace_id: string | null
          id: string | null
          import_id: string | null
          projet: string | null
          record_id: string | null
          texte: string | null
        }
        Insert: {
          auteur?: string | null
          auteur_origine?: string | null
          cree_le?: string | null
          espace_id?: string | null
          id?: string | null
          import_id?: string | null
          projet?: string | null
          record_id?: string | null
          texte?: string | null
        }
        Update: {
          auteur?: string | null
          auteur_origine?: string | null
          cree_le?: string | null
          espace_id?: string | null
          id?: string | null
          import_id?: string | null
          projet?: string | null
          record_id?: string | null
          texte?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_projets_v1: {
        Row: {
          actif: boolean | null
          charge_le: string | null
          chemin_registre: string | null
          decouverte_active: boolean | null
          espace_id: string | null
          exclusions: string[] | null
          geographies: string[] | null
          mots_cles: string[] | null
          natures_suivies: string[] | null
          nom: string | null
          notes: number | null
          opportunites_etiquetees: number | null
          profil: Json | null
          retire_du_registre_le: string | null
          revue_profil: string | null
          secteurs: string[] | null
          slug: string | null
          sources: Json | null
          statut: string | null
          taches_ouvertes: number | null
          type: string | null
          types_financement: string[] | null
          une_ligne: string | null
          url: string | null
        }
        Insert: {
          actif?: boolean | null
          charge_le?: string | null
          chemin_registre?: never
          decouverte_active?: boolean | null
          espace_id?: string | null
          exclusions?: string[] | null
          geographies?: string[] | null
          mots_cles?: string[] | null
          natures_suivies?: string[] | null
          nom?: string | null
          notes?: never
          opportunites_etiquetees?: never
          profil?: Json | null
          retire_du_registre_le?: string | null
          revue_profil?: string | null
          secteurs?: string[] | null
          slug?: string | null
          sources?: Json | null
          statut?: string | null
          taches_ouvertes?: never
          type?: string | null
          types_financement?: string[] | null
          une_ligne?: string | null
          url?: string | null
        }
        Update: {
          actif?: boolean | null
          charge_le?: string | null
          chemin_registre?: never
          decouverte_active?: boolean | null
          espace_id?: string | null
          exclusions?: string[] | null
          geographies?: string[] | null
          mots_cles?: string[] | null
          natures_suivies?: string[] | null
          nom?: string | null
          notes?: never
          opportunites_etiquetees?: never
          profil?: Json | null
          retire_du_registre_le?: string | null
          revue_profil?: string | null
          secteurs?: string[] | null
          slug?: string | null
          sources?: Json | null
          statut?: string | null
          taches_ouvertes?: never
          type?: string | null
          types_financement?: string[] | null
          une_ligne?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oia_projet_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_rattachement_v1: {
        Row: {
          espace_id: string | null
          id: string | null
          projet: string | null
          rattachement: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_signals_v1: {
        Row: {
          acquitte_le: string | null
          action_suivante: string | null
          detail: string | null
          espace_id: string | null
          gravite: number | null
          id: string | null
          le: string | null
          nature_signal: string | null
          projet: string | null
          record_id: string | null
          titre: string | null
          type: string | null
        }
        Relationships: []
      }
      ml_suggestions_v1: {
        Row: {
          confiance: number | null
          espace_id: string | null
          etiquetee: boolean | null
          geographies: string[] | null
          id: string | null
          mots_cles: string[] | null
          projet: string | null
          rang_opportunite: number | null
          rang_projet: number | null
          record_id: string | null
          score: number | null
          secteurs: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_taches_v1: {
        Row: {
          auteur: string | null
          auteur_origine: string | null
          cree_le: string | null
          echeance: string | null
          en_retard: boolean | null
          espace_id: string | null
          faite_le: string | null
          id: string | null
          import_id: string | null
          projet: string | null
          record_id: string | null
          statut: string | null
          titre: string | null
        }
        Insert: {
          auteur?: string | null
          auteur_origine?: string | null
          cree_le?: string | null
          echeance?: string | null
          en_retard?: never
          espace_id?: string | null
          faite_le?: string | null
          id?: string | null
          import_id?: string | null
          projet?: string | null
          record_id?: string | null
          statut?: string | null
          titre?: string | null
        }
        Update: {
          auteur?: string | null
          auteur_origine?: string | null
          cree_le?: string | null
          echeance?: string | null
          en_retard?: never
          espace_id?: string | null
          faite_le?: string | null
          id?: string | null
          import_id?: string | null
          projet?: string | null
          record_id?: string | null
          statut?: string | null
          titre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_toutes_v1: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_montant: string | null
          decide_le: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          emetteur: string | null
          espace_id: string | null
          gate_ok: boolean | null
          id: string | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          raisons_gate: string[] | null
          recommandation: string | null
          record_id: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          url_officielle: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_toutes_v2: {
        Row: {
          categorie: Database["public"]["Enums"]["ml_categorie"] | null
          confiance_information: number | null
          confiance_montant: string | null
          decide_le: string | null
          decide_par: string | null
          decide_par_origine: string | null
          decision_humaine: string | null
          devise: string | null
          disparu_le: string | null
          echeance: string | null
          echeance_plus_tardive: string | null
          emetteur: string | null
          espace_id: string | null
          fraicheur: string | null
          gate_ok: boolean | null
          gate_ok_source: boolean | null
          id: string | null
          jours_restants: number | null
          montant: number | null
          montant_connu: boolean | null
          nature: string | null
          projet_etiquete: string | null
          projets_decouverte: string[] | null
          publie_le: string | null
          raisons_gate: string[] | null
          recommandation: string | null
          recommandation_source: string | null
          record_id: string | null
          route_strategique: string | null
          sens: Database["public"]["Enums"]["ml_sens"] | null
          statut_verification: string | null
          titre: string | null
          type_avis: string | null
          url_officielle: string | null
          verdict_analyste: string | null
          verifie_par_humain: boolean | null
          vu_la_derniere_fois: string | null
          vu_la_premiere_fois: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_opportunities_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_vues_enregistrees_v1: {
        Row: {
          auteur_origine: string | null
          cree_le: string | null
          espace_id: string | null
          filtres: Json | null
          id: string | null
          import_id: string | null
          nom: string | null
          sens: string | null
          tri: string | null
          type: string | null
        }
        Insert: {
          auteur_origine?: string | null
          cree_le?: string | null
          espace_id?: string | null
          filtres?: Json | null
          id?: string | null
          import_id?: string | null
          nom?: string | null
          sens?: string | null
          tri?: string | null
          type?: string | null
        }
        Update: {
          auteur_origine?: string | null
          cree_le?: string | null
          espace_id?: string | null
          filtres?: Json | null
          id?: string | null
          import_id?: string | null
          nom?: string | null
          sens?: string | null
          tri?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "ml_imports_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "oia_import"
            referencedColumns: ["id"]
          },
        ]
      }
      oia_ia_budget_v1: {
        Row: {
          alerte: boolean | null
          alerte_usd: number | null
          appels_money_match: number | null
          appels_shyrka: number | null
          depense_usd: number | null
          mois: string | null
          plafond_usd: number | null
          refus: number | null
          reserve_usd: number | null
          reste_usd: number | null
        }
        Insert: {
          alerte?: never
          alerte_usd?: number | null
          appels_money_match?: never
          appels_shyrka?: never
          depense_usd?: number | null
          mois?: string | null
          plafond_usd?: number | null
          refus?: never
          reserve_usd?: number | null
          reste_usd?: never
        }
        Update: {
          alerte?: never
          alerte_usd?: number | null
          appels_money_match?: never
          appels_shyrka?: never
          depense_usd?: number | null
          mois?: string | null
          plafond_usd?: number | null
          refus?: never
          reserve_usd?: number | null
          reste_usd?: never
        }
        Relationships: []
      }
      oia_ia_couts_v1: {
        Row: {
          alerte_budget: boolean | null
          assistant: string | null
          cout_estime_mois_usd: number | null
          cout_estime_par_reponse_usd: number | null
          cout_facture_mois_usd: number | null
          cout_retenu_mois_usd: number | null
          depense_budget_mois_usd: number | null
          espace_id: string | null
          facture_relevee_le: string | null
          fournisseur: string | null
          frequence: string | null
          marque_id: string | null
          mis_a_jour_le: string | null
          modele: string | null
          module: string | null
          mois: string | null
          nb_appels: number | null
          nb_questions: number | null
          nb_reponses: number | null
          nb_reponses_prevues: number | null
          plafond_mois_usd: number | null
          plafond_perimetre: string | null
          reserve_budget_mois_usd: number | null
          service: string | null
          seuil_alerte_usd: number | null
          source_cout: string | null
          statut_comptage: string | null
          suivi: boolean | null
          unite_volume: string | null
          version: string | null
          voie_acces: string | null
        }
        Relationships: []
      }
      oia_ia_factures_v1: {
        Row: {
          attribuee: boolean | null
          espace_id: string | null
          fournisseur: string | null
          mois: string | null
          montant_usd: number | null
          note: string | null
          releve_le: string | null
        }
        Insert: {
          attribuee?: never
          espace_id?: string | null
          fournisseur?: string | null
          mois?: string | null
          montant_usd?: number | null
          note?: string | null
          releve_le?: string | null
        }
        Update: {
          attribuee?: never
          espace_id?: string | null
          fournisseur?: string | null
          mois?: string | null
          montant_usd?: number | null
          note?: string | null
          releve_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oia_ia_facture_espace_id_fkey"
            columns: ["espace_id"]
            isOneToOne: false
            referencedRelation: "oia_espace"
            referencedColumns: ["id"]
          },
        ]
      }
      vis_apercu_v1: {
        Row: {
          borne_basse: number | null
          borne_haute: number | null
          client_id: string | null
          denominateur: number | null
          etat: string | null
          indicateur: string | null
          jours_mesures: number | null
          jours_prevus: number | null
          methode_intervalle: string | null
          moteur: string | null
          numerateur: number | null
          ordre: number | null
          raison_non_mesurable: string | null
          subject_id: string | null
          valeur: number | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_citations_v1: {
        Row: {
          categorie: string | null
          citations: number | null
          client_id: string | null
          dernier_jour: string | null
          domaine: string | null
          moteur: string | null
          premier_jour: string | null
          questions: number | null
          reponses: number | null
          subject_id: string | null
          url: string | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_concurrents_v1: {
        Row: {
          borne_basse: number | null
          borne_haute: number | null
          client_id: string | null
          denominateur_part: number | null
          entite: string | null
          est_marque: boolean | null
          mentions: number | null
          methode_intervalle: string | null
          moteur: string | null
          part_de_voix: number | null
          questions: number | null
          reponses_jugees: number | null
          subject_id: string | null
          taux_apparition: number | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_mesure_v1: {
        Row: {
          changement_modele: boolean | null
          client_id: string | null
          collecteurs: string[] | null
          cout_estime_usd: number | null
          debut: string | null
          etat: string | null
          fin: string | null
          jours_manquants: number | null
          jours_mesures: number | null
          jours_prevus: number | null
          langues: string[] | null
          moteurs: string[] | null
          questions: number | null
          reponses: number | null
          reponses_jugees: number | null
          reponses_non_jugees: number | null
          statut_fenetre: string | null
          subject_id: string | null
          type_fenetre: string | null
          version_panel: number | null
          versions_modele: string[] | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_planificateur_v1: {
        Row: {
          actif: boolean | null
          bascule_le: string | null
          bascule_par: string | null
          client_id: string | null
          motif: string | null
        }
        Relationships: []
      }
      vis_questions_v1: {
        Row: {
          avec_marque: number | null
          client_id: string | null
          etat: string | null
          etiquettes: string[] | null
          jour: string | null
          langue: string | null
          marquee: boolean | null
          moteur: string | null
          question_id: string | null
          reponses: number | null
          reponses_jugees: number | null
          subject_id: string | null
          texte: string | null
          version_question: number | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_rapports_v1: {
        Row: {
          chiffres: Json | null
          client_id: string | null
          empreinte: string | null
          fichier: string | null
          genere_le: string | null
          id: string | null
          statut: string | null
          subject_id: string | null
          type: string | null
          version_panel: number | null
          window_id: string | null
        }
        Insert: {
          chiffres?: Json | null
          client_id?: string | null
          empreinte?: string | null
          fichier?: string | null
          genere_le?: string | null
          id?: string | null
          statut?: string | null
          subject_id?: string | null
          type?: string | null
          version_panel?: number | null
          window_id?: string | null
        }
        Update: {
          chiffres?: Json | null
          client_id?: string | null
          empreinte?: string | null
          fichier?: string | null
          genere_le?: string | null
          id?: string | null
          statut?: string | null
          subject_id?: string | null
          type?: string | null
          version_panel?: number | null
          window_id?: string | null
        }
        Relationships: []
      }
      vis_recommandations_v1: {
        Row: {
          client_id: string | null
          confiance: string | null
          cree_le: string | null
          cree_par: string | null
          decide_le: string | null
          decide_par: string | null
          derniere_execution: string | null
          effort: string | null
          enonce: string | null
          etat: string | null
          execute_le: string | null
          id: string | null
          impact: string | null
          motif: string | null
          preuves: Json | null
          priorite: number | null
          reference_execution: string | null
          risque: string | null
          site_id: string | null
          subject_id: string | null
          titre: string | null
          type: string | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_reponses_v1: {
        Row: {
          client_id: string | null
          collecteur: string | null
          concurrents: string[] | null
          cout_usd: number | null
          empreinte: string | null
          fournisseur: string | null
          id: string | null
          jour: string | null
          langue: string | null
          marque_citee: boolean | null
          moteur: string | null
          nb_citations: number | null
          question_id: string | null
          recherche_web: boolean | null
          recu_le: string | null
          statut_jugement: string | null
          subject_id: string | null
          texte: string | null
          version_modele: string | null
          version_question: number | null
          window_id: string | null
        }
        Insert: {
          client_id?: string | null
          collecteur?: string | null
          concurrents?: never
          cout_usd?: number | null
          empreinte?: never
          fournisseur?: never
          id?: string | null
          jour?: string | null
          langue?: string | null
          marque_citee?: never
          moteur?: string | null
          nb_citations?: never
          question_id?: string | null
          recherche_web?: never
          recu_le?: string | null
          statut_jugement?: never
          subject_id?: string | null
          texte?: string | null
          version_modele?: string | null
          version_question?: number | null
          window_id?: string | null
        }
        Update: {
          client_id?: string | null
          collecteur?: string | null
          concurrents?: never
          cout_usd?: number | null
          empreinte?: never
          fournisseur?: never
          id?: string | null
          jour?: string | null
          langue?: string | null
          marque_citee?: never
          moteur?: string | null
          nb_citations?: never
          question_id?: string | null
          recherche_web?: never
          recu_le?: string | null
          statut_jugement?: never
          subject_id?: string | null
          texte?: string | null
          version_modele?: string | null
          version_question?: number | null
          window_id?: string | null
        }
        Relationships: []
      }
      vis_reseaux_sociaux_v1: {
        Row: {
          citations: number | null
          client_id: string | null
          denominateur: number | null
          moteurs: string[] | null
          part: number | null
          plateforme: string | null
          questions: number | null
          subject_id: string | null
          url: string | null
          window_id: string | null
        }
        Relationships: []
      }
      vis_seo_command_v1: {
        Row: {
          client_id: string | null
          cout_usd: number | null
          details: Json | null
          id: number | null
          le: string | null
          mission_id: string | null
          qui: string | null
          quoi: string | null
          subject_id: string | null
        }
        Insert: {
          client_id?: string | null
          cout_usd?: number | null
          details?: Json | null
          id?: number | null
          le?: string | null
          mission_id?: string | null
          qui?: string | null
          quoi?: string | null
          subject_id?: string | null
        }
        Update: {
          client_id?: string | null
          cout_usd?: number | null
          details?: Json | null
          id?: number | null
          le?: string | null
          mission_id?: string | null
          qui?: string | null
          quoi?: string | null
          subject_id?: string | null
        }
        Relationships: []
      }
      vis_sujets_v1: {
        Row: {
          client_id: string | null
          client_nom: string | null
          domaines: string[] | null
          mon_role: string | null
          statut: string | null
          subject_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ml_categorie_de: {
        Args: { p_nature: string }
        Returns: Database["public"]["Enums"]["ml_categorie"]
      }
      ml_echeance_candidature: { Args: { p: Json }; Returns: string }
      ml_mot_entier: {
        Args: { p_terme: string; p_texte: string }
        Returns: boolean
      }
      ml_nature: { Args: { p_kind: string }; Returns: string }
      ml_sens_de: {
        Args: { p_nature: string }
        Returns: Database["public"]["Enums"]["ml_sens"]
      }
      oia_acquitter_alerte: { Args: { p_alerte: string }; Returns: undefined }
      oia_annuler_import: {
        Args: { p_confirmer_modifications?: boolean; p_import: string }
        Returns: Json
      }
      oia_apercu_annulation: { Args: { p_import: string }; Returns: Json }
      oia_basculer_tache: { Args: { p_tache: string }; Returns: string }
      oia_creer_contact: {
        Args: {
          p_email?: string
          p_espace: string
          p_nom: string
          p_note?: string
          p_organisation?: string
          p_projet?: string
          p_record_id?: string
          p_role?: string
          p_telephone?: string
        }
        Returns: string
      }
      oia_creer_tache: {
        Args: {
          p_echeance?: string
          p_espace: string
          p_projet?: string
          p_record_id?: string
          p_titre: string
        }
        Returns: string
      }
      oia_decider: {
        Args: {
          p_action: string
          p_commentaire: string
          p_espace: string
          p_gate_ok: boolean
          p_record_id: string
        }
        Returns: string
      }
      oia_demander: {
        Args: {
          p_charge: Json
          p_espace: string
          p_type: Database["public"]["Enums"]["request_kind"]
        }
        Returns: string
      }
      oia_empreinte: { Args: { p: string[] }; Returns: string }
      oia_enregistrer_vue: {
        Args: {
          p_espace: string
          p_filtres: Json
          p_nom: string
          p_sens: string
          p_tri: string
        }
        Returns: string
      }
      oia_est_membre: { Args: { p_espace: string }; Returns: boolean }
      oia_etiqueter: {
        Args: { p_espace: string; p_projet: string; p_record_id: string }
        Returns: undefined
      }
      oia_exiger_editeur: { Args: { p_espace: string }; Returns: string }
      oia_ia_regler: {
        Args: {
          p_appel: number
          p_cout: number
          p_jetons_entree: number
          p_jetons_sortie: number
          p_modele?: string
          p_nb_candidats?: number
          p_ok: boolean
          p_outils?: string[]
        }
        Returns: Json
      }
      oia_ia_relever_facture: {
        Args: {
          p_espace: string
          p_fournisseur: string
          p_mois: string
          p_montant: number
          p_note?: string
        }
        Returns: {
          espace_id: string
          fournisseur: string
          mois: string
          montant_usd: number
          note: string | null
          releve_le: string
          releve_par: string | null
        }
        SetofOptions: {
          from: "*"
          to: "oia_ia_facture"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      oia_ia_reserver: {
        Args: { p_cout_max: number; p_jetons_entree: number; p_service: string }
        Returns: number
      }
      oia_ia_retirer_facture: {
        Args: { p_espace: string; p_fournisseur: string; p_mois: string }
        Returns: boolean
      }
      oia_importer_sauvegarde: {
        Args: { p_espace: string; p_sauvegarde: Json }
        Returns: Json
      }
      oia_journaliser: {
        Args: {
          p_action: string
          p_cible: string
          p_cible_id: string
          p_detail?: Json
          p_espace: string
        }
        Returns: undefined
      }
      oia_json_objet: { Args: { p: Json }; Returns: Json }
      oia_json_tableau: { Args: { p: Json }; Returns: Json }
      oia_marquer_visite: { Args: { p_espace: string }; Returns: Json }
      oia_modifier_note: {
        Args: { p_note: string; p_texte: string }
        Returns: undefined
      }
      oia_noter: {
        Args: {
          p_espace: string
          p_projet?: string
          p_record_id?: string
          p_texte: string
        }
        Returns: string
      }
      oia_proposer_projet: {
        Args: {
          p_contenu: Json
          p_espace: string
          p_lancer_recherche?: boolean
          p_slug: string
        }
        Returns: Json
      }
      oia_proprietaire: { Args: { p_espace: string }; Returns: boolean }
      oia_role: { Args: { p_espace: string }; Returns: string }
      oia_supprimer: {
        Args: { p_id: string; p_type: string }
        Returns: undefined
      }
      shy_ajouter_contexte: {
        Args: { p_contenu: string; p_source: string; p_type: string }
        Returns: string
      }
      shy_creer_brouillon: {
        Args: {
          p_contenu: string
          p_conversation: string
          p_titre: string
          p_type: string
        }
        Returns: string
      }
      shy_enregistrer_echange: {
        Args: {
          p_conversation: string
          p_message: string
          p_reponse: string
          p_sources?: Json
        }
        Returns: string
      }
      shy_exiger_mickael: { Args: never; Returns: string }
      shy_journaliser: {
        Args: {
          p_acteur: string
          p_cible: string
          p_quoi: string
          p_resultat: string
        }
        Returns: undefined
      }
      shy_oublier: { Args: { p_id: string; p_quoi: string }; Returns: number }
      shy_statuer_contexte: {
        Args: { p_id: string; p_statut: string }
        Returns: undefined
      }
      vis_rejeter_recommandation: {
        Args: { p_motif: string; p_recommandation: string }
        Returns: number
      }
      vis_valider_recommandation: {
        Args: { p_motif?: string; p_recommandation: string }
        Returns: number
      }
    }
    Enums: {
      alert_kind:
        | "NEW_MATCH"
        | "CLOSING_SOON"
        | "JUST_EXPIRED"
        | "DEADLINE_CHANGED"
        | "DISAPPEARED"
        | "APPROVED_BUT_BLOCKED"
      ml_categorie:
        | "subvention"
        | "chiffre_affaires_contractuel_potentiel"
        | "investissement_capital"
        | "pret"
        | "aide_fiscale"
        | "montant_inconnu"
      ml_sens: "entrant" | "sortant"
      request_kind: "DISCOVERY" | "INGEST_URL" | "LINK_CHECK"
      request_status: "QUEUED" | "RUNNING" | "DONE" | "FAILED"
      watch_event_type:
        | "DISCOVERED"
        | "UPDATED"
        | "DEADLINE_SET"
        | "DEADLINE_CHANGED"
        | "RECOMMENDATION_CHANGED"
        | "VERIFICATION_CHANGED"
        | "DISAPPEARED"
        | "REAPPEARED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_kind: [
        "NEW_MATCH",
        "CLOSING_SOON",
        "JUST_EXPIRED",
        "DEADLINE_CHANGED",
        "DISAPPEARED",
        "APPROVED_BUT_BLOCKED",
      ],
      ml_categorie: [
        "subvention",
        "chiffre_affaires_contractuel_potentiel",
        "investissement_capital",
        "pret",
        "aide_fiscale",
        "montant_inconnu",
      ],
      ml_sens: ["entrant", "sortant"],
      request_kind: ["DISCOVERY", "INGEST_URL", "LINK_CHECK"],
      request_status: ["QUEUED", "RUNNING", "DONE", "FAILED"],
      watch_event_type: [
        "DISCOVERED",
        "UPDATED",
        "DEADLINE_SET",
        "DEADLINE_CHANGED",
        "RECOMMENDATION_CHANGED",
        "VERIFICATION_CHANGED",
        "DISAPPEARED",
        "REAPPEARED",
      ],
    },
  },
} as const
