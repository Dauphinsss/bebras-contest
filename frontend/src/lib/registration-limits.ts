/**
 * Topes de longitud de los campos de acceso (login, registro y alta de colegios
 * desde el perfil).
 *
 * Son exactamente los mismos que ya aplican los validadores: `maxlength` solo
 * impide seguir escribiendo, la validacion sigue siendo la que decide. Cada
 * valor esta atado a su validador por `tests/registration-limits.unit.ts`, que
 * falla si alguno de los dos cambia sin el otro.
 *
 * `maxlength` cuenta unidades UTF-16 y los validadores cuentan puntos de codigo
 * o bytes, asi que el limite del navegador nunca es mas permisivo que el real.
 */
export const REGISTRATION_LIMITS = {
  /** `validateRegistrationText`: 100 puntos de código. */
  firstName: 100,
  /** `validateRegistrationText`: 100 puntos de código. */
  lastName: 100,
  /** `validateRegistrationText`: 200 puntos de código. */
  schoolName: 200,
  /** `validateEmail`: 254 caracteres en total. */
  email: 254,
  /** `validatePhone`: 100 caracteres antes de normalizar. */
  phone: 100,
  /** `registrationPasswordError`: 72 bytes (bcrypt). */
  password: 72,
} as const;
