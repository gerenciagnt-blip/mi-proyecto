// Default para el slot `children` del layout con slots paralelos.
// Sin esto, cuando Next reconcilia el árbol del router después de cerrar
// un modal intercept (router.back / push) puede tirar
// "TypeError: initialTree is not iterable" porque no encuentra qué
// renderizar para el slot `children` mientras hace el patch.
//
// Re-exportamos la página de lista — es lo que el usuario espera ver.
export { default } from './page';
