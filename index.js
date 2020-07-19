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
var qrcode = require('qrcode');

//REST
const puerto = 8080;
const rutadef = '/virtualpresentation';
/** Formulario (get) y envío de credenciales (post)
 * /virtualpresentation/usuario */
const urlLogin = rutadef + '/usuario';
/** (get) devuelve presentaciones guardadas
 * /virtualpresentation/:usuario */
const urlUsuario = rutadef + '/:usuario';
/** Crear y borrar (delete) sesión
 * /virtualpresentation/session/:usuario */
const urlcreaSesion = rutadef + '/session/:usuario';
/** Mostrar qr  
 * /virtualpresentation/:usuario/:nombresesion */
const urlpresentacion = urlUsuario + '/:nombresesion';

//Almacenamiento de las sesiones creadas
let sesiones = [];

//
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

//Obtener los recursos necesarios para la página web
//app.use('/public/css', express.static(__dirname + '/css'));
//app.use('/public/js', express.static(__dirname + '/js'));
//app.use('/public/img', express.static(__dirname + '/img'));

//Opciones para el QR
var qrOp = {
	errorCorrectionLevel: 'H',
	type: 'image/jpeg',
	quality: 0.3,
	margin: 1,
	color: {
		dark: "#027507FF",
		light: "#DEDEDEFF"
	}
}

// Formulario de login (web)
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
	//console.log('usuario: ' + usuario + ', sesion: ' + sesion + ', presentacion: ' + presentacion);
	if (sesion && presentacion) {
		var sesion = new Sesion(usuario, sesion, presentacion);
		sesiones.push(sesion);
		/*sesiones.push({
			nombreusuario: usuario,
			nombresesion: sesion,
			presentacion: presentacion
		});*/
		console.log(sesiones);
		//response.status(200).send(sesiones); //Prueba
		response.status(200).send('Sesión creada');
	} else {
		//406: no aceptable TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido datos');
	}
});
//Finaliza la sesión
app.delete(urlcreaSesion, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.body.session;
	//var presentacion = request.body.presentation;
	//TODO eliminar la sesión de la lista
	var pos = buscaSesion(usuario, sesion);
	if (pos != -1) {
		sesiones.splice(pos, 1);
		//response.send(sesiones);
		response.status(200).send('Sesión borrada');
	} else {
		//409: conflict
		response.status(409).send('La sesión no existe');
	}
});

/* Mostrará un código qr (con el nombre de la sesión y usuario)
	y redirecciona cuando reciba OK de la aplicación */
//TODO añadir comprobaciones antes de mostrar qr
app.get(urlpresentacion, function (request, response) {
	var usuario = request.params.usuario;
	var nombresesion = request.params.nombresesion;
	var index = buscaSesion(usuario, nombresesion);
	if (index != -1) {
		var jsonSesion = JSON.stringify(sesiones[index]);

		qrcode.toDataURL(jsonSesion, qrOp, function (err, url) {
			//console.log(url);
			response.render(path.join(__dirname, 'public', 'sesion.ejs'), { 'nombre': usuario, 'qr': url });
		});
	} else {
		response.status(404).send('Los datos no son correctos');
	}
});

app.listen(puerto, () => {
	console.log(`Servidor Presentación virtual:
http://localhost:${puerto}/virtualpresentation`)
});

function Sesion(usuario, sesion, presentacion) {
	this.nombreusuario = usuario;
	this.nombresesion = sesion;
	this.presentacion = presentacion;
}

function buscaSesion(usuario, sesion) {
	var index = -1;
	sesiones.forEach(function (s, i) {
		console.log(i + ' - ' + s.nombresesion);
		if (s.nombreusuario == usuario && s.nombresesion == sesion) {
			console.log('Coincide usuario y sesion');
			index = i;
		}
	});
	return index;
}