"use client";

import { useRef, type ChangeEventHandler } from "react";
import { ImagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImageUploadButton({
  id,
  inputRef,
  onChange,
}: {
  id?: string;
  inputRef?: (node: HTMLInputElement | null) => void;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex">
      <input
        id={id}
        type="file"
        accept="image/*"
        hidden
        ref={(node) => {
          fileRef.current = node;
          inputRef?.(node);
        }}
        onChange={onChange}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlusIcon data-icon="inline-start" />
        Subir imagen
      </Button>
    </div>
  );
}
