-- Sprint Chat · notif bandeja — agrega tipo CHAT_MENSAJE_NUEVO al enum
-- de notificaciones. Emitido por `enviarMensajeAction` cuando un
-- participante destinatario lleva >2 min sin abrir la conversación
-- (chat "frío"). Dedup de 5 min para no spamear.

-- AlterEnum
ALTER TYPE "NotificacionTipo" ADD VALUE 'CHAT_MENSAJE_NUEVO';
