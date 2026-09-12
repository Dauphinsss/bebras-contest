-- Firebase Authentication pasa a ser el sistema de identidad. La relacion con
-- el perfil Bebras es el UID, no el correo. Aditiva: la columna admite NULL y
-- SQLite no considera duplicados los NULL en un indice unico, asi que las filas
-- existentes siguen validas hasta que se les asigne su UID.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
