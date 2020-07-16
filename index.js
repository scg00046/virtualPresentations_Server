/**
 * Servicio de presentación virtual controlado desde terminal móvil.
 * 
 * @author Sergio Caballero Garrido
 */
//Librerías necesarias
var express = require('express');
var path = require('path');
var app = express();
var bodyParser = require('body-parser'); //Recibe los datos enviados en los formularios
var mysql = require('./conexion_bbdd'); //Conexión a la base de datos

//Constantes
const puerto = 8080;
const rutadef = '/virtualpresentation';
/** /virtualpresentation/usuario */
const urlLogin = rutadef + '/usuario';
/** /virtualpresentation/:usuario */
const urlUsuario = rutadef + '/:usuario';
/** /virtualpresentation/session/:usuario */
const urlcreaSesion = rutadef + '/session/:usuario';
/** /virtualpresentation/:usuario/:nombresesion */
const urlpresentacion = urlUsuario + '/:nombresesion';

//Almacenamiento de las sesiones creadas
let sesiones = [];

//
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Obtener los recursos necesarios para la página web
//app.use('/public/css', express.static(__dirname + '/css'));
//app.use('/public/js', express.static(__dirname + '/js'));
//app.use('/public/img', express.static(__dirname + '/img'));

// Formulario de login
app.get(urlLogin, function (request, response) {
	response.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post(urlLogin, function (request, response) {
	var username = request.body.user;
	var password = request.body.password;
	if (username && password) {

		mysql.buscausuario(username).then((usuario) => {
			console.log('El usuario buscado es: ' + usuario.nombreusuario);

			if (username == usuario.nombreusuario && password == usuario.password) {
				var user = {
					nombreusuario: usuario.nombreusuario,
					nombre: usuario.nombre,
					apellidos: usuario.apellidos
				};
				//Responde con código 200 y el objeto usuario
				response.status(200).send('OK:' + Object.values(user));
			} else {
				response.send('ERROR 2: Usuario o contraseña incorrectos!');
			}
		}).catch((error) => {
			response.send(error);
		}).finally(() => { response.end(); });
	} else {
		response.send('ERROR 1: Intruduzca sus datos de usuario!');
		response.end();
	}
});

/* Petición get a /virtualpresentation/usuario
	Devuelve las presentaciones almacenadas para seleccionarla 
	desde la aplicación */
app.get(urlUsuario, function (request, response) {
	var usuario = request.params.usuario;

	mysql.buscaPresentaciones(usuario).then((listaPresentaciones) => {
		response.status(200).send(listaPresentaciones);
	}).catch((error) => {
		response.send(error);
	}).finally(() => { response.end(); });
});

/*Petición para crear sesión
Atributos necesarios: nombresesion; presentacion;
*/
//TODO realizar comprobacion de usuario y/o sesión
app.post(urlcreaSesion, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.body.session;
	var presentacion = request.body.presentation;
	console.log('usuario: ' + usuario + ', sesion: ' + sesion + ', presentacion: ' + presentacion);
	if (sesion && presentacion) {
		sesiones.push({
			nombreusuario: usuario,
			nombresesion: sesion,
			presentacion: presentacion
		});
		response.status(200).send('Sesión creada');
	}
});
//Finaliza la sesión
app.delete(urlcreaSesion, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.body.session;
	var presentacion = request.body.presentation;
	//TODO eliminar la sesión de la lista
});

/* Mostrará un código qr (con el nombre de la sesión y usuario)
	y redirecciona cuando reciba OK de la aplicación */
//TODO completar
app.get(urlpresentacion, function (request, response) {
	var usuario = request.params.usuario;
	var nombresesion = request.params.nombresesion;

});

app.listen(puerto, () => {
	console.log(`Servidor Presentación virtual:
http://localhost:${puerto}/virtualpresentation`)
});