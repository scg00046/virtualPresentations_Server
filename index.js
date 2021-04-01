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
const random = require('randomstring');
const swaggerUi = require('swagger-ui-express');
const jwt = require('jwt-simple');

const midd = require('./middleware');

//REST
const puerto = 8080;
const rutadef = '/virtualpresentation';
/** Formulario (get) y envío de credenciales (post)
 * /virtualpresentation/usuario */
const urlLogin = rutadef + '/usuario';
/** (get) devuelve presentaciones almacenadas
 *  (put) almacena una nueva presentación
 *  (post) elimina una presentación
 * /virtualpresentation/:usuario */
const urlUsuario = rutadef + '/:usuario';
/** Crear y borrar (delete) sesión
 * /virtualpresentation/session/:usuario */
const urlcreaSesion = rutadef + '/session/:usuario';
/** Mostrar qr  
 * /virtualpresentation/:usuario/:nombresesion */
const urlpresentacion = urlUsuario + '/:nombresesion';

//
app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

//Obtener los recursos necesarios para la página web
//app.use('/public/css', express.static(__dirname + '/css'));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/private', express.static(path.join(__dirname, 'private')));
app.use('/pdf-reader', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist')));
//app.use('/public/img', express.static(__dirname + '/img'));

//Documentación de la API
const swaggerDocument = require('./public/swagger.json');
var swaggerOptions = {
	explorer: true,
	customCss: '.swagger-ui .topbar { display: none }',
	swaggerOptions: {
		url: `http://localhost:8080/virtualpresentation/swagger.json`
	}
};
app.use(rutadef + '/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

//Opciones para el QR
const qrOp = {
	errorCorrectionLevel: 'H',
	type: 'image/jpeg',
	quality: 0.3,
	margin: 1,
	color: {
		dark: "#027507FF",
		light: "#FFFFFFFF"
	}
}

/* Registro de usuario */
app.put(urlLogin, function (request, response) {
	var usuario = request.body;

	if (usuario) {
		mysql.buscausuario(usuario.nombreusuario).then((usuario) => {
			response.status(409).send("El usuario ya existe");
		}).catch((error) => {
			if (error == 'No se encuentra el usuario!') {
				mysql.registraUsuario(usuario).then(function (resp) {
					response.status(200).send(resp);
				}).catch((error) => {
					response.status(500).send(error);
				});
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(400).send('No se han recibido datos');
	}

});

/* Acceso de credenciales */
app.post(urlLogin, function (request, response) {
	var username = request.body.user;
	var password = request.body.password;
	if (username && password) {

		mysql.buscausuario(username).then((usuario) => {

			if (username == usuario.nombreusuario && password == usuario.password) {
				var user = {
					fecha: new Date(),
					id: usuario.id,
					nombreusuario: usuario.nombreusuario,
					nombre: usuario.nombre,
					apellidos: usuario.apellidos
				};
				var token = jwt.encode(user, midd.TAG);
				delete user['fecha'];
				user['token'] = token;
				mysql.actualizaToken(user.id, token).then(r => {
					response.status(200).send(user); //Responde con código 200 y el objeto usuario
				}).catch(err => {
					response.status(500).send(err);
				});
			} else {
				response.status(401).send("Usuario o contraseña incorrectos!");
			}
		}).catch((error) => {
			if (error == 'No se encuentra el usuario!') {
				response.status(401).send("Usuario o contraseña incorrectos!");
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(400).send('Intruduzca sus datos de usuario!');
	}
});

/* Cierre de sesión de usuario */
app.get(urlLogin, midd.autenticacion, function (request, response) {
	mysql.eliminaToken(request.idUsuario, request.header('Autenticacion')).then(r=>{
		response.status(200).send(r);
	}).catch(e => {
		response.status(500).send(e);
	});
});

/* Petición get a /virtualpresentation/usuario
	Devuelve las presentaciones almacenadas para seleccionarla 
	desde la aplicación */
app.get(urlUsuario, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario;
	var hora = new Date().getHours() + ':' + new Date().getMinutes();
	console.log(hora + " Petición de presentaciones: " + usuario);
	if (usuario == request.usuario) {
		mysql.buscaPresentaciones(request.usuario).then((listaPresentaciones) => {
			response.status(200).send(listaPresentaciones);
		}).catch((error) => {
			if (error == 'Lista vacía') {
				//response.status(204).send("No hay presentaciones para el usuario");
				response.status(204).send([]);
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});
/* Subida de presentación al servidor */
app.put(urlUsuario, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario;
	var presentacion = request.files.presentacion;

	if (usuario == request.usuario && presentacion) {
		if (!request.files || Object.keys(request.files).length === 0) {
			return response.status(400).send('No se ha subido ningún archivo');
		} else {
			//Comprobación de usuario
			mysql.compruebaPresentacion(request.usuario, presentacion.name).then((result) => {

				if (result == 'OK') {
					var directorioUsuario = path.join(__dirname, 'private', usuario);
					var directorioPresentacion = path.join(__dirname, 'private', usuario, presentacion.name);

					//Comprobación directorio del usuario
					fs.mkdir(directorioUsuario, (e) => {
						/*console.log('directorio: ',e);
						if (e.code == "EEXIST") {
							return;
						} else if (e) {
							return console.log('Error: ' + e.code);
						}
						console.log('Directorio creado');*/
					});
					//Añadir presentación al directorio y a la base de datos
					presentacion.mv(directorioPresentacion, function (err) {
						if (err) {
							console.error('Error al guardar la presentación: ' + err.code);
							return response.status(500).send(err);
						} else {
							console.log('Presentación almacenada');
							//Obtener el número de páginas y agregarlo a la base de datos
							pdfparse(fs.readFileSync(directorioPresentacion)).then(function (datos) {
								var paginas = datos.numpages;
								console.log('numero de paginas', paginas);
								mysql.creaPresentacion(presentacion.name, paginas, usuario).then((respuesta) => {
									if (respuesta == 'OK') {
										console.log('registro en bbdd');
										//crear json para notas fijas
										var notasPresentacion = presentacion.name.split('.')[0] + '.json';
										var listaNotas = path.join(directorioUsuario, notasPresentacion);
										fs.writeFile(listaNotas, '[]', function (err) {
											if (err) return err;
											console.log('DONE');
										});

										response.status(200).send('Presentación almacenada');
									}
								}).catch(e => {
									console.error('error 167', e);
									if (e.toString().startsWith('ERROR')) {
										console.error('Error en el registro en la bbdd: ', e);
										try {
											//Elimina el fichero si no se ha podido registrar
											fs.unlinkSync(directorioPresentacion);
										} catch (err) {
											console.error('Error al Eliminar fichero: ' + err);
											//response.status(500).send('No se ha podido eliminar');
										}
										return e;
									}
								});
							});
						}
					});
				}
			}).catch((error) => { //La presentación está registrada o se ha producido un error en la base de datos
				if (error == 'La presentación ya existe') {
					response.status(409).send(error);
				} else {
					response.status(500).send(error);
				}
			});
		}
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});
/* Eliminar presentación almacenada */
app.delete(urlUsuario, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario;
	var presentacion = request.headers.presentacion;

	if (usuario == request.usuario && presentacion) {

		var directorioPresentacion = path.join(__dirname, 'private', usuario, presentacion);
		try {
			fs.unlinkSync(directorioPresentacion);
			var notasPresentacion = presentacion.split('.')[0] + '.json';
			var listaNotas = path.join(__dirname, 'private', usuario, notasPresentacion);
			fs.unlinkSync(listaNotas);
			mysql.eliminaPresentacion(presentacion, usuario).then((respuesta) => {
				if (respuesta == 'OK') {
					response.status(200).send('Eliminado correctamente');
				}
			}).catch((e) => {
				response.status(500).send('Error en la base de datos: ' + e);
			});
		} catch (err) {
			response.status(500).send('No se ha podido eliminar');
		}

	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

/*Petición para crear sesión
Atributos necesarios: nombresesion; presentacion;
*/
app.post(urlcreaSesion, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario; //de la propia url
	var sesion_req = request.body.session;
	var presentacion = request.body.presentation;

	if (usuario == request.usuario && sesion_req && presentacion) {
		mysql.registraSesion(sesion_req, presentacion, usuario).then(s => {
			response.status(200).send(s);
		}).catch(e => {
			response.status(500).send(e);
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

//Finaliza la sesión
app.delete(urlcreaSesion, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.headers.session;

	if (usuario == request.usuario && sesion) {

		mysql.eliminaSesion(sesion, usuario).then(resp => {
			response.status(200).send('Sesión eliminada correctamente');
		}).catch(e => {
			response.status(500).send(e);
		});
	} else {
		response.status(403).send('Parámetros incorrectos o incompletos');
	}
});

/* Mostrará un código qr (con el nombre de la sesión y usuario)
	y redirecciona cuando reciba OK de la aplicación */
app.get(urlpresentacion, function (request, response) {
	var usuario = request.params.usuario;
	var nombresesion = request.params.nombresesion;

	var rand = random.generate({
		length: 5,
		charset: 'alphanumeric'
	});
	mysql.buscaSesionUsuario(usuario, nombresesion).then(sesion => {
		sesion.codigo = rand;
		var jsonSesion = JSON.stringify(sesion);
		var sesionCodigo = sesion.sesion + '_' + rand;
		qrcode.toDataURL(jsonSesion, qrOp, function (err, url) {
			var notasPresentacion = sesion.presentacion.split('.')[0] + '.json';
			var rutaNotas = path.join(__dirname, 'private', sesion.usuario, notasPresentacion);
			var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
			response.status(200).render(path.join(__dirname, 'public', 'presentation.ejs'),
				{ 'sesion': sesion, 'qr': url, 'listaNotas': listaNotas, 'sesionCodigo': sesionCodigo });
		});
	}).catch(e => {
		if (e == 'La sesión no existe') {
			response.status(400).render(path.join(__dirname, 'public', 'errorsession.ejs'), { 'usuario': usuario, 'sesion': nombresesion });
		} else {
			response.status(500).send(e);
		}
	});
});

http.listen(puerto, () => {
	console.log(`Servidor Presentación virtual:
http://localhost:${puerto}/virtualpresentation`)
});

// Conexión de clientes socket
io.on('connection', (socket) => {
	//console.log('Room socket: ' + nombresesion + '; Usuario conectado, id:', socket.id);
	console.log('Usuario conectado: ' + socket.id);
	//io.emit('Hi!');
	//Recepción de mensajes
	socket.on('virtualPresentations', (msg) => {
		var nombresesion = msg.sesion;
		console.log('Mensaje (' + nombresesion + '): ' + Object.values(msg)/*msg*/);
		//io.to(msg.usuario).emit('cambia pagina',msg);
		//io.emit('virtualPresentations', msg);
		if (msg.fijar) {
			console.log('nota a fijar');
			//var usuario = msg.usuario.split('-')[0]; //usuario sin '-nota'
			var s = msg.sesion.split('_')[0]; //Sesión sin el código
			mysql.buscaSesionUsuario(msg.usuario, s).then(sesion => {
				var notasPresentacion = sesion.presentacion.split('.')[0] + '.json';
				var rutaNotas = path.join(__dirname, 'private', sesion.usuario, notasPresentacion);
				var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
				let nota = {
					fecha: getFecha(),
					nota: msg.nota
				}
				listaNotas.push(nota);
				fs.writeFileSync(rutaNotas, JSON.stringify(listaNotas, null, 1));
			}).catch(e => { console.error(e) });

		}
		io.emit(nombresesion, msg);
	});
	//Desconexión de usuario
	socket.on('disconnect', () => {
		console.log('Usuario desconectado, id:', socket.id);
		//io.emit('virtualPresentations', "desconectado");
	});
});

function getFecha() {
	var hoy = new Date();
	return hoy.getDate() + '/' + (hoy.getMonth() + 1) + '/' + hoy.getFullYear();
}

