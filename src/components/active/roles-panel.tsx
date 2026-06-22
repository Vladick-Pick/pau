"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActiveParticipantSummary, ClubRole } from "./types";

type Props = {
  canManage: boolean;
  roles: ClubRole[];
  participants: ActiveParticipantSummary[];
  onCreate: (name: string, description?: string) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
};

export function RolesPanel({
  canManage,
  roles,
  participants,
  onCreate,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName || creating) return;
    setCreating(true);
    try {
      await onCreate(trimmedName, desc.trim() || undefined);
      setName("");
      setDesc("");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(roleId: string) {
    if (deletingId) return;
    setDeletingId(roleId);
    try {
      await onDelete(roleId);
    } finally {
      setDeletingId(null);
    }
  }

  // Count per role from participants list
  const countForRole = (roleId: string) =>
    participants.filter((p) => p.roleIds.includes(roleId)).length;

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div>
        <h2 className="text-sm font-semibold">Роли активных</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Справочник ролей. Назначаются активному участнику в его карточке.
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {roles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Роли не созданы</p>
        ) : (
          roles.map((role) => (
            <div
              key={role.id}
              className="grid gap-1 rounded-lg border bg-card p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{role.name}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {countForRole(role.id)}
                  </Badge>
                  {canManage ? (
                    <Button
                      aria-label={`Удалить роль ${role.name}`}
                      disabled={deletingId === role.id}
                      onClick={() => void handleDelete(role.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {role.description ? (
                <p className="text-[11.5px] text-muted-foreground">
                  {role.description}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canManage ? (
        <div className="mt-3 grid gap-2">
          <Input
            placeholder="Название роли"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <Input
            placeholder="Короткое описание (необязательно)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="text-sm"
          />
          <Button
            disabled={!name.trim() || creating}
            onClick={() => void handleCreate()}
            type="button"
            size="sm"
          >
            <PlusIcon data-icon="inline-start" />
            Создать роль
          </Button>
        </div>
      ) : null}
    </div>
  );
}
