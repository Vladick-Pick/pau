"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Club } from "./types";

type Props = {
  clubs: Club[];
  selectedClubId: string | null;
  onSelect: (clubId: string) => void;
};

export function ClubSwitcher({ clubs, selectedClubId, onSelect }: Props) {
  if (clubs.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">Загрузка клубов...</span>
    );
  }

  return (
    <Select
      value={selectedClubId ?? ""}
      onValueChange={(v) => {
        if (v) onSelect(v);
      }}
    >
      <SelectTrigger className="h-8 w-auto min-w-36 max-w-52 text-xs">
        <SelectValue placeholder="Выберите клуб" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {clubs.map((club) => (
            <SelectItem key={club.id} value={club.id}>
              {club.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
