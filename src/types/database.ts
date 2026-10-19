
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "deletion_requests": {
                  Row: {
                    "completed_at": string | null,"id": string,"requested_at": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"id"?: string,"requested_at"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"id"?: string,"requested_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"help_requests": {
                  Row: {
                    "created_at": string,"id": string,"message": string | null,"occurrence_id": string,"recipient_id": string,"requester_id": string,"responded_at": string | null,"space_id": string,"status": Database["public"]['Enums']["help_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"occurrence_id": string,"recipient_id": string,"requester_id": string,"responded_at"?: string | null,"space_id": string,"status"?: Database["public"]['Enums']["help_status"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"occurrence_id"?: string,"recipient_id"?: string,"requester_id"?: string,"responded_at"?: string | null,"space_id"?: string,"status"?: Database["public"]['Enums']["help_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "help_requests_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "routine_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "help_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "help_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "help_requests_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "body": string,"created_at": string,"data": NonNullable<Json>,"expires_at": string | null,"id": string,"important": boolean,"kind": string,"logical_event_key": string,"push_retry_at": string | null,"push_retry_count": number,"push_status": string,"push_ticket_ids": Json | null,"read_at": string | null,"recipient_id": string,"scheduled_at": string,"space_id": string | null,"status": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"data"?: NonNullable<Json>,"expires_at"?: string | null,"id"?: string,"important"?: boolean,"kind": string,"logical_event_key": string,"push_retry_at"?: string | null,"push_retry_count"?: number,"push_status"?: string,"push_ticket_ids"?: Json | null,"read_at"?: string | null,"recipient_id": string,"scheduled_at"?: string,"space_id"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"expires_at"?: string | null,"id"?: string,"important"?: boolean,"kind"?: string,"logical_event_key"?: string,"push_retry_at"?: string | null,"push_retry_count"?: number,"push_status"?: string,"push_ticket_ids"?: Json | null,"read_at"?: string | null,"recipient_id"?: string,"scheduled_at"?: string,"space_id"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "notification_outbox_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "quiet_enabled": boolean,"quiet_end": string,"quiet_start": string,"summary_enabled": boolean,"summary_time": string,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"summary_enabled"?: boolean,"summary_time"?: string,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"summary_enabled"?: boolean,"summary_time"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"nickname": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"nickname": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"nickname"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_devices": {
                  Row: {
                    "created_at": string,"enabled": boolean,"id": string,"invalidated_at": string | null,"last_seen_at": string,"platform": string,"token": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"id"?: string,"invalidated_at"?: string | null,"last_seen_at"?: string,"platform": string,"token": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"id"?: string,"invalidated_at"?: string | null,"last_seen_at"?: string,"platform"?: string,"token"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"reactions": {
                  Row: {
                    "author_id": string,"created_at": string,"event_id": string,"id": string,"message": string | null,"removed_at": string | null,"space_id": string,"type": Database["public"]['Enums']["reaction_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"created_at"?: string,"event_id": string,"id"?: string,"message"?: string | null,"removed_at"?: string | null,"space_id": string,"type": Database["public"]['Enums']["reaction_type"]
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"event_id"?: string,"id"?: string,"message"?: string | null,"removed_at"?: string | null,"space_id"?: string,"type"?: Database["public"]['Enums']["reaction_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reactions_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "reactions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "routine_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reactions_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_assignees": {
                  Row: {
                    "routine_id": string,"sequence_order": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "routine_id": string,"sequence_order": number,"user_id": string
                  }
                  Update: {
                    "routine_id"?: string,"sequence_order"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_assignees_routine_id_fkey"
      columns: ["routine_id"]
isOneToOne: false
      referencedRelation: "routines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_assignees_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"routine_events": {
                  Row: {
                    "actor_id": string,"event_type": Database["public"]['Enums']["routine_event_type"],"id": string,"occurrence_id": string,"original_assignee_id": string | null,"payload": NonNullable<Json>,"performer_id": string | null,"recorded_at": string,"request_id": string,"reverts_event_id": string | null,"routine_id": string,"space_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"event_type": Database["public"]['Enums']["routine_event_type"],"id"?: string,"occurrence_id": string,"original_assignee_id"?: string | null,"payload"?: NonNullable<Json>,"performer_id"?: string | null,"recorded_at"?: string,"request_id": string,"reverts_event_id"?: string | null,"routine_id": string,"space_id": string
                  }
                  Update: {
                    "actor_id"?: string,"event_type"?: Database["public"]['Enums']["routine_event_type"],"id"?: string,"occurrence_id"?: string,"original_assignee_id"?: string | null,"payload"?: NonNullable<Json>,"performer_id"?: string | null,"recorded_at"?: string,"request_id"?: string,"reverts_event_id"?: string | null,"routine_id"?: string,"space_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_events_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "routine_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_events_original_assignee_id_fkey"
      columns: ["original_assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_events_performer_id_fkey"
      columns: ["performer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_events_reverts_event_id_fkey"
      columns: ["reverts_event_id"]
isOneToOne: false
      referencedRelation: "routine_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_events_routine_id_fkey"
      columns: ["routine_id"]
isOneToOne: false
      referencedRelation: "routines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_events_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_notification_prefs": {
                  Row: {
                    "enabled": boolean,"routine_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"routine_id": string,"user_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"routine_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_notification_prefs_routine_id_fkey"
      columns: ["routine_id"]
isOneToOne: false
      referencedRelation: "routines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"routine_occurrences": {
                  Row: {
                    "assigned_user_id": string | null,"created_at": string,"created_from_occurrence_id": string | null,"custom_override": boolean,"due_local_date": string,"id": string,"is_fixed_slot": boolean,"is_manual": boolean,"is_single_open": boolean,"original_assignee_id": string | null,"performer_id": string | null,"resolved_at": string | null,"resolved_by": string | null,"resolved_local_date": string | null,"routine_id": string,"rule_version": number,"seq": number,"space_id": string,"status": Database["public"]['Enums']["occurrence_status"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_user_id"?: string | null,"created_at"?: string,"created_from_occurrence_id"?: string | null,"custom_override"?: boolean,"due_local_date": string,"id"?: string,"is_fixed_slot"?: boolean,"is_manual"?: boolean,"is_single_open"?: boolean,"original_assignee_id"?: string | null,"performer_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"resolved_local_date"?: string | null,"routine_id": string,"rule_version": number,"seq"?: never,"space_id": string,"status"?: Database["public"]['Enums']["occurrence_status"],"version"?: number
                  }
                  Update: {
                    "assigned_user_id"?: string | null,"created_at"?: string,"created_from_occurrence_id"?: string | null,"custom_override"?: boolean,"due_local_date"?: string,"id"?: string,"is_fixed_slot"?: boolean,"is_manual"?: boolean,"is_single_open"?: boolean,"original_assignee_id"?: string | null,"performer_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"resolved_local_date"?: string | null,"routine_id"?: string,"rule_version"?: number,"seq"?: never,"space_id"?: string,"status"?: Database["public"]['Enums']["occurrence_status"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_occurrences_assigned_user_id_fkey"
      columns: ["assigned_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_occurrences_created_from_occurrence_id_fkey"
      columns: ["created_from_occurrence_id"]
isOneToOne: false
      referencedRelation: "routine_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_occurrences_original_assignee_id_fkey"
      columns: ["original_assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_occurrences_performer_id_fkey"
      columns: ["performer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_occurrences_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routine_occurrences_routine_id_fkey"
      columns: ["routine_id"]
isOneToOne: false
      referencedRelation: "routines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_occurrences_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_rules": {
                  Row: {
                    "created_at": string,"routine_id": string,"rule": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"routine_id": string,"rule": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "created_at"?: string,"routine_id"?: string,"rule"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_rules_routine_id_fkey"
      columns: ["routine_id"]
isOneToOne: false
      referencedRelation: "routines"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_templates": {
                  Row: {
                    "category": string,"id": string,"mode": Database["public"]['Enums']["routine_mode"],"rule": NonNullable<Json>,"sort_order": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"id": string,"mode": Database["public"]['Enums']["routine_mode"],"rule": NonNullable<Json>,"sort_order"?: number,"title": string
                  }
                  Update: {
                    "category"?: string,"id"?: string,"mode"?: Database["public"]['Enums']["routine_mode"],"rule"?: NonNullable<Json>,"sort_order"?: number,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"routines": {
                  Row: {
                    "archived_at": string | null,"assignment_mode": Database["public"]['Enums']["assignment_mode"],"create_request_id": string | null,"created_at": string,"created_by": string,"current_rule_version": number,"id": string,"mode": Database["public"]['Enums']["routine_mode"],"notify_enabled": boolean,"space_id": string,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"assignment_mode"?: Database["public"]['Enums']["assignment_mode"],"create_request_id"?: string | null,"created_at"?: string,"created_by": string,"current_rule_version"?: number,"id"?: string,"mode": Database["public"]['Enums']["routine_mode"],"notify_enabled"?: boolean,"space_id": string,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"assignment_mode"?: Database["public"]['Enums']["assignment_mode"],"create_request_id"?: string | null,"created_at"?: string,"created_by"?: string,"current_rule_version"?: number,"id"?: string,"mode"?: Database["public"]['Enums']["routine_mode"],"notify_enabled"?: boolean,"space_id"?: string,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "routines_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "routines_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"space_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string,"expires_at": string,"id": string,"revoked_at": string | null,"space_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by": string,"expires_at": string,"id"?: string,"revoked_at"?: string | null,"space_id": string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string,"expires_at"?: string,"id"?: string,"revoked_at"?: string | null,"space_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "space_invitations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "space_invitations_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"space_members": {
                  Row: {
                    "id": string,"joined_at": string,"left_at": string | null,"role": Database["public"]['Enums']["space_role"],"space_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"joined_at"?: string,"left_at"?: string | null,"role"?: Database["public"]['Enums']["space_role"],"space_id": string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"joined_at"?: string,"left_at"?: string | null,"role"?: Database["public"]['Enums']["space_role"],"space_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_members_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "space_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"space_notification_settings": {
                  Row: {
                    "enabled": boolean,"space_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"space_id": string,"user_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"space_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_notification_settings_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "space_notification_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"spaces": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string,"id": string,"name": string,"timezone": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"name": string,"timezone": string,"version"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"timezone"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "spaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_code": string }; Returns: Json
                           },
"adjust_open_after_resolution":
{ Args: { "p_apply_to_current": boolean,"p_routine_id": string }; Returns: undefined
                           },
"archive_space":
{ Args: { "p_space_id": string }; Returns: Json
                           },
"complete_occurrence":
{ Args: { "p_occurrence_id": string,"p_request_id": string }; Returns: Json
                           },
"create_invitation":
{ Args: { "p_space_id": string }; Returns: Json
                           },
"create_space":
{ Args: { "p_name": string,"p_timezone": string }; Returns: Json
                           },
"deleted_user_nickname":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"detach_member":
{ Args: { "p_space_id": string,"p_user_id": string }; Returns: undefined
                           },
"dispatch_due_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"dispatch_notification":
{ Args: { "p_id": string }; Returns: boolean
                           },
"drop_plain_future_fixed":
{ Args: { "p_include_today": boolean,"p_routine_id": string,"p_today": string }; Returns: undefined
                           },
"enqueue_notification":
{ Args: { "p_body": string,"p_data": Json,"p_expires_at": string,"p_important": boolean,"p_key": string,"p_kind": string,"p_recipient_id": string,"p_scheduled_at": string,"p_space_id": string,"p_title": string }; Returns: undefined
                           },
"enqueue_scheduled_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"ensure_first_after_resolution":
{ Args: { "p_routine_id": string }; Returns: undefined
                           },
"ensure_space_occurrences":
{ Args: { "p_space_id": string }; Returns: number
                           },
"find_request_event":
{ Args: { "p_actor_id": string,"p_event_types": (Database["public"]['Enums']["routine_event_type"])[],"p_request_id": string,"p_target_id": string }; Returns: {
              "actor_id": string,
"event_type": Database["public"]['Enums']["routine_event_type"],
"id": string,
"occurrence_id": string,
"original_assignee_id": string | null,
"payload": NonNullable<Json>,
"performer_id": string | null,
"recorded_at": string,
"request_id": string,
"reverts_event_id": string | null,
"routine_id": string,
"space_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "routine_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"hash_invite_code":
{ Args: { "p_code": string }; Returns: string
                           },
"in_quiet_hours":
{ Args: { "p_at": string,"p_user_id": string }; Returns: boolean
                           },
"invite_code_bytes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"invite_expiry_days":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"is_space_admin":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"is_space_member":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"is_valid_timezone":
{ Args: { "p_tz": string }; Returns: boolean
                           },
"last_day_of_month":
{ Args: { "p_date": string }; Returns: number
                           },
"leave_space":
{ Args: { "p_space_id": string }; Returns: Json
                           },
"list_help_messages":
{ Args: { "p_space_id": string }; Returns: {
              "id": string,"message": string
            }[]
                           },
"list_invitations":
{ Args: { "p_space_id": string }; Returns: {
              "accepted_at": string,"created_at": string,"expires_at": string,"id": string,"revoked_at": string
            }[]
                           },
"lock_occurrence":
{ Args: { "p_occurrence_id": string }; Returns: {
              "assigned_user_id": string | null,
"created_at": string,
"created_from_occurrence_id": string | null,
"custom_override": boolean,
"due_local_date": string,
"id": string,
"is_fixed_slot": boolean,
"is_manual": boolean,
"is_single_open": boolean,
"original_assignee_id": string | null,
"performer_id": string | null,
"resolved_at": string | null,
"resolved_by": string | null,
"resolved_local_date": string | null,
"routine_id": string,
"rule_version": number,
"seq": number,
"space_id": string,
"status": Database["public"]['Enums']["occurrence_status"],
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "routine_occurrences"
        isOneToOne: true
        isSetofReturn: false
      } },
"lock_valid_invitation":
{ Args: { "p_code": string }; Returns: {
              "accepted_at": string | null,
"accepted_by": string | null,
"created_at": string,
"created_by": string,
"expires_at": string,
"id": string,
"revoked_at": string | null,
"space_id": string,
"token_hash": string
            }
                          SetofOptions: {
        from: "*"
        to: "space_invitations"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"materialize_all_spaces":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"materialize_fixed":
{ Args: { "p_routine_id": string }; Returns: number
                           },
"materialize_window_days":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"max_rule_interval":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"next_manual_assignee":
{ Args: { "p_routine_id": string }; Returns: string
                           },
"next_quiet_end":
{ Args: { "p_at": string,"p_user_id": string }; Returns: string
                           },
"pick_assignee":
{ Args: { "p_prev_assignee": string,"p_routine_id": string }; Returns: string
                           },
"preview_horizon_days":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"preview_invite":
{ Args: { "p_code": string }; Returns: Json
                           },
"preview_max_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"preview_routine_dates":
{ Args: { "p_count"?: number,"p_from": string,"p_mode": Database["public"]['Enums']["routine_mode"],"p_rule": Json }; Returns: string[]
                           },
"push_max_retries":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"raise_app_error":
{ Args: { "p_code": string,"p_detail"?: string }; Returns: undefined
                           },
"reapply_account_deletions":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reauth_window_seconds":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"register_push_device":
{ Args: { "p_platform": string,"p_token": string }; Returns: Json
                           },
"reminder_repeat_hours":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"remove_member":
{ Args: { "p_space_id": string,"p_user_id": string }; Returns: Json
                           },
"remove_reaction":
{ Args: { "p_event_id": string }; Returns: Json
                           },
"rename_space":
{ Args: { "p_name": string,"p_space_id": string }; Returns: Json
                           },
"replace_assignees":
{ Args: { "p_assignees": (string)[],"p_mode": Database["public"]['Enums']["assignment_mode"],"p_routine_id": string,"p_space_id": string }; Returns: undefined
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"request_correction":
{ Args: { "p_message": string,"p_occurrence_id": string,"p_request_id": string }; Returns: Json
                           },
"request_help":
{ Args: { "p_message": string,"p_occurrence_id": string,"p_recipient_id": string,"p_request_id": string }; Returns: Json
                           },
"require_member":
{ Args: { "p_space_id": string }; Returns: string
                           },
"require_user":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"resolve_occurrence":
{ Args: { "p_occurrence_id": string,"p_request_id": string,"p_status": Database["public"]['Enums']["occurrence_status"] }; Returns: Json
                           },
"respond_help":
{ Args: { "p_accept": boolean,"p_help_request_id": string,"p_request_id": string }; Returns: Json
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: Json
                           },
"rule_matches":
{ Args: { "p_date": string,"p_rule": Json }; Returns: boolean
                           },
"run_manual_routine":
{ Args: { "p_request_id": string,"p_routine_id": string }; Returns: Json
                           },
"scrub_user_data":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"send_reaction":
{ Args: { "p_event_id": string,"p_message": string,"p_type": Database["public"]['Enums']["reaction_type"] }; Returns: Json
                           },
"set_push_device_enabled":
{ Args: { "p_device_id": string,"p_enabled": boolean }; Returns: Json
                           },
"set_routine_archived":
{ Args: { "p_archived": boolean,"p_routine_id": string }; Returns: Json
                           },
"set_routine_notification":
{ Args: { "p_enabled": boolean,"p_routine_id": string }; Returns: Json
                           },
"set_space_notifications":
{ Args: { "p_enabled": boolean,"p_space_id": string }; Returns: Json
                           },
"shares_space_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"skip_occurrence":
{ Args: { "p_occurrence_id": string,"p_request_id": string }; Returns: Json
                           },
"space_today":
{ Args: { "p_space_id": string }; Returns: string
                           },
"spawn_next_after_resolution":
{ Args: { "p_base_date": string,"p_occurrence_id": string,"p_rotate": boolean }; Returns: string
                           },
"step_down_admin":
{ Args: { "p_space_id": string }; Returns: Json
                           },
"summary_grace_hours":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"transfer_admin":
{ Args: { "p_space_id": string,"p_user_id": string }; Returns: Json
                           },
"undo_resolution":
{ Args: { "p_occurrence_id": string,"p_request_id": string }; Returns: Json
                           },
"update_notification_preferences":
{ Args: { "p_quiet_enabled": boolean,"p_quiet_end": string,"p_quiet_start": string,"p_summary_enabled": boolean,"p_summary_time": string,"p_timezone": string }; Returns: Json
                           },
"update_occurrence":
{ Args: { "p_assignee_id": string,"p_clear_assignee": boolean,"p_due_local_date": string,"p_occurrence_id": string,"p_request_id": string }; Returns: Json
                           },
"update_profile":
{ Args: { "p_nickname": string }; Returns: Json
                           },
"upsert_routine":
{ Args: { "p_apply_to_current"?: boolean,"p_assignees": (string)[],"p_assignment_mode": Database["public"]['Enums']["assignment_mode"],"p_expected_version"?: number,"p_mode": Database["public"]['Enums']["routine_mode"],"p_notify_enabled": boolean,"p_request_id"?: string,"p_routine_id": string,"p_rule": Json,"p_space_id": string,"p_title": string }; Returns: Json
                           },
"validate_rule":
{ Args: { "p_mode": Database["public"]['Enums']["routine_mode"],"p_rule": Json }; Returns: undefined
                           },
"validate_rule_strict":
{ Args: { "p_mode": Database["public"]['Enums']["routine_mode"],"p_rule": Json }; Returns: undefined
                           }
          }
          Enums: {
            "assignment_mode": "fixed"|"rotate"|"free","help_status": "pending"|"accepted"|"declined"|"cancelled","occurrence_status": "scheduled"|"completed"|"skipped"|"void","reaction_type": "thanks"|"great"|"cheer"|"relieved"|"ack","routine_event_type": "completed"|"undone"|"skipped"|"help_requested"|"help_accepted"|"help_declined"|"manual_run"|"rescheduled"|"correction_requested","routine_mode": "fixed"|"after_resolution"|"manual","space_role": "admin"|"member"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "assignment_mode": ["fixed", "rotate", "free"],"help_status": ["pending", "accepted", "declined", "cancelled"],"occurrence_status": ["scheduled", "completed", "skipped", "void"],"reaction_type": ["thanks", "great", "cheer", "relieved", "ack"],"routine_event_type": ["completed", "undone", "skipped", "help_requested", "help_accepted", "help_declined", "manual_run", "rescheduled", "correction_requested"],"routine_mode": ["fixed", "after_resolution", "manual"],"space_role": ["admin", "member"]
          }
        }
} as const
