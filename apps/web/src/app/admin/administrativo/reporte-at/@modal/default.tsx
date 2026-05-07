// Slot vacío cuando no hay match de ruta interceptada — sin esto Next
// re-renderiza la última versión del slot, lo que dejaría el modal
// abierto al volver a la lista.
export default function Default() {
  return null;
}
