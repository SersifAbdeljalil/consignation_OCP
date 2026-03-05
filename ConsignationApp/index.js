// index.js
import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// Il assure que l'environnement est correctement configuré
// que ce soit dans Expo Go ou un native build
registerRootComponent(App);