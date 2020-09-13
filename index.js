/**
 * Servicio de presentación virtual controlado desde terminal móvil.
 * 
 * @author Sergio Caballero Garrido
 */
//Librerías necesarias
const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require('body-parser'); //Recibe los datos enviados en los formularios
const fileUpload = require('express-fileupload'); //Para subir ficheros
const fs = require('fs');
const pdfparse = require('pdf-parse'); //Obtener datos de la presentación
const pdfjsdist = require('pdfjs-dist'); //Lector pdf
const mysql = require('./conexion_bbdd'); //Conexión a la base de datos
const qrcode = require('qrcode');
const http = require('http').createServer(app); //npm i http
const io = require('socket.io')(http); //npm i socket.io

//REST
const puerto = 8080;
const rutadef = '/virtualpresentation';
/** Formulario (get) y envío de credenciales (post)
 * /virtualpresentation/usuario */
const urlLogin = rutadef + '/usuario';
/** (get) devuelve presentaciones almacenadas
 *  (post) almacena una nueva presentación
 *  (delete) elimina una presentación
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
app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

//Obtener los recursos necesarios para la página web
//app.use('/public/css', express.static(__dirname + '/css'));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/private', express.static(path.join(__dirname, 'private')));
app.use('/pdf-reader', express.static( path.join(__dirname, 'node_modules', 'pdfjs-dist') ) );
//app.use('/public/img', express.static(__dirname + '/img'));

//Opciones para el QR
const qrOp = {
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
			//console.log('El usuario buscado es: ' + usuario.nombreusuario);
			if (username == usuario.nombreusuario && password == usuario.password) {
				var user = {
					id: usuario.id,
					nombreusuario: usuario.nombreusuario,
					nombre: usuario.nombre,
					apellidos: usuario.apellidos
				};
				response.status(200).send(user); //Responde con código 200 y el objeto usuario

			} else {
				response.status(403).send("Usuario o contraseña incorrectos!");
			}
		}).catch((error) => {
			response.status(500).send(error);
		}).finally(() => { response.end(); });
	} else {
		response.status(400).send('Intruduzca sus datos de usuario!');
		response.end();
	}
});

/* Petición get a /virtualpresentation/usuario
	Devuelve las presentaciones almacenadas para seleccionarla 
	desde la aplicación */
app.get(urlUsuario, function (request, response) {
	var usuario = request.params.usuario;
	var hora = new Date().getHours() + ':' + new Date().getMinutes();
	console.log(hora + " Petición de presentaciones: " + usuario);
	mysql.buscaPresentaciones(usuario).then((listaPresentaciones) => {
		//response.status(200).send(listaPresentaciones);
		response.status(200).send(listaPresentaciones);
	}).catch((error) => {
		response.status(404).send(error);
	}).finally(() => { response.end(); });
});
/* Subida de presentación al servidor */
app.put(urlUsuario, function (request, response) {
	var usuario = request.params.usuario;
	var idUsuario = request.body.id;
	var presentacion = request.files.presentacion;

	if (usuario && presentacion && idUsuario) {
		if (!request.files || Object.keys(request.files).length === 0) {
			return res.status(400).send('No se ha subido ningún archivo');
		} else {
			//Comprobación de usuario
			mysql.compruebaUsuario(idUsuario, usuario).then((result) => {
				if (result == 'OK') {
					var directorioUsuario = path.join(__dirname, 'private', usuario);
					var directorioPresentacion = path.join(__dirname, 'private', usuario, presentacion.name);

					//Comprobación directorio del usuario
					fs.mkdir(directorioUsuario, (e) => {
						if (e.code == "EEXIST") {
							return;
						} else if (e) {
							return console.log('Error: ' + e.code);
						}
						console.log('Directorio creado');
					});
					//Añadir presentación al directorio y a la base de datos
					presentacion.mv(directorioPresentacion, function (err) {
						if (err) {
							console.error('Error al guardar la presentación: ' + err.code);
							return res.status(500).send(err);
						} else {
							console.log('Presentación recibida');
							//Obtener el número de páginas y agregarlo a la base de datos
							pdfparse(fs.readFileSync(directorioPresentacion)).then(function (datos) {
								var paginas = datos.numpages;
								mysql.creaPresentacion(presentacion.name, paginas, usuario).then((respuesta) => {
									if (respuesta == 'OK') {
										response.status(200).send('Presentación subida');
									} //TODO else no guardar el fichero
								});
							});
						}
					});
				}
			}).catch((error) => { //El usuario no coincide o se ha producido un error en la base de datos
				console.log('Error: ' + error);
				//403 Forbidden
				res.status(403).send('El usuario no está registrado');
			}).finally(() => { response.end(); });
		}
	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido datos');
	}
});
/* Eliminar presentación almacenada */
app.post(urlUsuario, function (request, response) {
	var usuario = request.params.usuario;
	var presentacion = request.body.presentacion;
	var idUsuario = request.body.id;
	//console.log(usuario + '--' + presentacion + '--' + idUsuario);
	if (usuario && presentacion && idUsuario) {
		var directorioPresentacion = path.join(__dirname, 'private', usuario, presentacion);
		mysql.compruebaUsuario(idUsuario, usuario).then((result) => {
			if (result == 'OK') {
				try {
					fs.unlinkSync(directorioPresentacion);
					console.log('Archivo borrado');
					mysql.borraPresentacion(presentacion, usuario).then((respuesta) => {
						if (respuesta == 'OK') {
							response.status(200).send('Eliminado correctamente');
						}
					}).catch((e) => {
						//503: Service unavailable
						console.log('Error al borrar la tupla: ' + e);
						response.status(503).send('Error en la base de datos: ' + e);
					});
				} catch (err) {
					console.error('Eliminar fichero: ' + err);
					response.status(500).send('No se ha podido eliminar');
				}
			}
		}).catch((error) => { //El usuario no coincide o se ha producido un error en la base de datos
			console.log('Error: ' + error);
			//403 Forbidden
			response.status(403).send('El usuario no está registrado');
		}).finally(() => { response.end(); });

	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido los parámetros necesarios');
	}


});

/*Petición para crear sesión
Atributos necesarios: nombresesion; presentacion;
*/
//sesiones.push(new Sesion('admin', 'nuevaSesion', 'Tema 1 Protocolos de Aplicacion de Internet.pdf') ); //Sesión de prueba
app.post(urlcreaSesion, function (request, response) {
	var usuario = request.params.usuario; //de la propia url
	var sesion = request.body.session;
	var presentacion = request.body.presentation;
	//console.log('usuario: ' + usuario + ', sesion: ' + sesion + ', presentacion: ' + presentacion);
	//if (sesion && presentacion) {
	if (usuario && sesion && presentacion) {
		if (buscaSesion(usuario, sesion) != -1) {
			response.status(400).send('La sesión ya existe');
		} else {
			var sesion = new Sesion(usuario, sesion, presentacion);
			sesiones.push(sesion);
			console.log(sesiones);
			//response.status(200).send(sesiones); //Prueba
			response.status(200).send('Sesión creada');
		}
	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido datos');
	}
});
//Finaliza la sesión
//TODO comprobar usuario y contraseña
app.delete(urlcreaSesion, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.body.session;
	//var presentacion = request.body.presentation;
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
//TODO añadir comprobaciones antes de mostrar qr coincide usuario 
var nombresesion = "";
app.get(urlpresentacion, function (request, response) {
	var usuario = request.params.usuario;
	nombresesion = request.params.nombresesion;
	var index = buscaSesion(usuario, nombresesion);

	if (index != -1) {
		var sesion = sesiones[index];
		var jsonSesion = JSON.stringify(sesion);
		qrcode.toDataURL(jsonSesion, qrOp, function (err, url) {
			//console.log(url);
			response.render(path.join(__dirname, 'public', 'presentation.ejs'), { 'sesion': sesion, 'qr': url });
		});
	} else {
		response.status(404).send('La sesión no existe');
	}
});

http.listen(puerto, () => {
	console.log(`Servidor Presentación virtual:
http://localhost:${puerto}/virtualpresentation`)
});

// Conexión de clientes socket
io.on('connection', (socket) => {
	console.log('Room socket: ' + nombresesion + '; Usuario conectado, id:', socket.id);
	//io.emit('Hi!');
	//Recepción de mensajes
	socket.on(nombresesion, (msg) => {
		console.log('Mensaje ('+nombresesion+'): '+ Object.values(msg)/*msg*/);
		//io.to(msg.usuario).emit('cambia pagina',msg);
		io.emit(nombresesion, msg);
	});
	//Desconexión de usuario
	socket.on('disconnect', () => {
		console.log('Usuario desconectado, id:', socket.id);
		//io.emit(nombresesion, "desconectado");
	});
});


/* Sesión */
function Sesion(usuario, sesion, presentacion) {
	this.nombreusuario = usuario;
	this.nombresesion = sesion;
	this.presentacion = presentacion;
}

/**
 * Busca las sesiones creadas para el usuario y nombre de sesión específicos
 * Devuelve el índice de la sesión, si la sesión no existe devuelve -1
 * @param {String} usuario 
 * @param {String} sesion 
 */
function buscaSesion(usuario, sesion) {
	var index = -1;
	sesiones.forEach(function (s, i) {
		console.log(i + ' - ' + s.nombresesion);
		if (s.nombreusuario == usuario && s.nombresesion == sesion) {
			//console.log('Coincide usuario y sesion');
			index = i;
		}
	});
	return index;
}