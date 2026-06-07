import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  children?: React.ReactNode;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'destructive',
  children
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/60 backdrop-blur-md p-4">
      <Card className="w-full max-w-md border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] rounded-[40px] overflow-hidden animate-in fade-in zoom-in duration-300 ring-1 ring-white/10">
        <CardHeader className="flex flex-row items-center gap-5 space-y-0 p-8 pb-4">
          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg ${variant === 'destructive' ? 'bg-destructive text-white shadow-destructive/20' : 'bg-primary text-white shadow-primary/20'}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 p-8 pt-4">
          {message && (
            <p className="text-zinc-500 font-semibold text-sm leading-relaxed tracking-wide">
              {message}
            </p>
          )}
          {children}
          <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                onClick={onCancel}
                className="flex-1 h-12 rounded-xl border-border/60 font-bold uppercase text-[10px] tracking-widest hover:bg-muted transition-all"
            >
              {cancelText}
            </Button>
            <Button 
                variant={variant} 
                onClick={onConfirm}
                className={`flex-1 h-12 rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-lg transition-all active:scale-95 border-none ${variant === 'destructive' ? 'shadow-destructive/20' : 'shadow-primary/20'}`}
            >
              {confirmText}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
