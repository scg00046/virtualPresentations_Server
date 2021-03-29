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
			response.status(401).send("El usuario ya existe");
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
		response.status(406).send('No se han recibido datos');
	}

});

/* Acceso de credenciales */
app.post(urlLogin, function (request, response) {
	var username = request.body.user;
	var password = request.body.password;
	if (username && password) {

		mysql.buscausuario(username).then((usuario) => {
			//console.log('El usuario buscado es: ' + usuario.nombreusuario);
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
			if (error = 'No se encuentra el usuario!') {
				response.status(401).send("No hay presentaciones para el usuario");
			} else {
				response.status(500).send(error);
			}
		});
	} else {
		response.status(500).send('No tiene permiso para ver la lista de presentaciones del usuario');//TODO REVISAR
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
			}).catch((error) => { //El usuario no coincide, la presentación está registrada o se ha producido un error en la base de datos
				console.log('Error: ' + error);
				if (error == 'No se encuentra el usuario!') {
					//403 Forbidden
					response.status(403).send('El usuario no está registrado');
				} else if (error == 'La presentación ya existe') {
					response.status(406).send(error);
				} else {
					response.status(500).send(error);
				}
			});
		}
	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(400).send('No se han recibido datos');
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
			var pos = buscaSesionPresentacion(usuario, presentacion);
			if (pos != -1) {
				sesiones.splice(pos, 1); //Elimina la sesión para dicha presentación
			}
			mysql.borraPresentacion(presentacion, usuario).then((respuesta) => {
				if (respuesta == 'OK') {
					response.status(200).send('Eliminado correctamente');
				}
			}).catch((e) => {
				//503: Service unavailable
				response.status(500).send('Error en la base de datos: ' + e);
			});
		} catch (err) {
			response.status(500).send('No se ha podido eliminar');
		}

	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido los parámetros necesarios');
	}
});

/*Petición para crear sesión
Atributos necesarios: nombresesion; presentacion;
*/
//sesiones.push(new Sesion('admin', 'nuevaSesion', 'Tema 1 Protocolos de Aplicacion de Internet.pdf') ); //Sesión de prueba
app.post(urlcreaSesion, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario; //de la propia url
	var sesion_req = request.body.session;
	var presentacion = request.body.presentation;
	//console.log('usuario: ' + usuario + ', sesion: ' + sesion_req + ', presentacion: ' + presentacion);
	if (usuario == request.usuario && sesion_req && presentacion) {
		if (buscaSesion(usuario, sesion_req) != -1) {
			sesiones.forEach(function (s, i) {
				if (s.nombreusuario == usuario && s.presentacion == presentacion && s.nombresesion == sesion_req) {
					console.log('La sesión ya existe');
					return response.status(400).send('La sesión ya existe');
				} else if (s.nombreusuario == usuario && s.presentacion != presentacion && s.nombresesion == sesion_req) {
					console.log('Actualiza la sesión');
					//Elimina sesión y la crea de nuevo con la presentación actualizada
					sesiones.splice(i, 1);
					var sesion = new Sesion(usuario, sesion_req, presentacion);
					sesiones.push(sesion);
					//301: Movido permanentemente //TODO revisar
					return response.status(301).send('Se ha actualizado la sesión');
				}
			});
		} else {
			var sesion = new Sesion(usuario, sesion_req, presentacion);
			sesiones.push(sesion);
			console.log("Se ha creado la sesión");
			response.status(200).send('Sesión creada');
		}
	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido datos');
	}
});

//Finaliza la sesión
app.delete(urlcreaSesion, midd.autenticacion, function (request, response) {
	var usuario = request.params.usuario;
	var sesion = request.headers.session;
	
	console.log("Delete Session, usuario " + usuario + " sesion: " + sesion);
	if (usuario == request.usuario && sesion) {

		var pos = buscaSesion(usuario, sesion);
		if (pos != -1) {
			sesiones.splice(pos, 1);
			response.status(200).send('Sesión borrada');
		} else {
			//409: conflict
			response.status(409).send('La sesión no existe');
		}

	} else {
		//406: no aceptable //TODO revisar códigos de respuesta
		response.status(406).send('No se han recibido los parámetros necesarios');
	}
});

/* Mostrará un código qr (con el nombre de la sesión y usuario)
	y redirecciona cuando reciba OK de la aplicación */
app.get(urlpresentacion, function (request, response) {
	var usuario = request.params.usuario;
	var nombresesion = request.params.nombresesion;
	var index = buscaSesion(usuario, nombresesion);

	var rand = random.generate({
		length: 5,
		charset: 'alphanumeric'
	});
	if (index != -1) {
		var sesion = sesiones[index];
		sesion.codigo = rand;
		var jsonSesion = JSON.stringify(sesion);
		var sesionCodigo = sesion.nombresesion + '_' + rand;
		qrcode.toDataURL(jsonSesion, qrOp, function (err, url) {
			//console.log(url);
			var notasPresentacion = sesion.presentacion.split('.')[0] + '.json';
			var rutaNotas = path.join(__dirname, 'private', sesion.nombreusuario, notasPresentacion);
			var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
			response.status(200).render(path.join(__dirname, 'public', 'presentation.ejs'),
				{ 'sesion': sesion, 'qr': url, 'listaNotas': listaNotas, 'sesionCodigo': sesionCodigo });
		});
	} else {
		response.status(500).render(path.join(__dirname, 'public', 'errorsession.ejs'), { 'usuario': usuario, 'sesion': nombresesion });
	}
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
			var index = buscaSesion(msg.usuario, s);
			if (index != -1) {
				var s = sesiones[index];
				//console.log(sesiones[index].presentacion);
				var notasPresentacion = s.presentacion.split('.')[0] + '.json';
				var rutaNotas = path.join(__dirname, 'private', s.nombreusuario, notasPresentacion);
				var listaNotas = JSON.parse(fs.readFileSync(rutaNotas, 'utf8'));
				nota = {
					fecha: getFecha(),
					nota: msg.nota
				}
				listaNotas.push(nota);
				fs.writeFileSync(rutaNotas, JSON.stringify(listaNotas, null, 1));
			}

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
		//console.log(i + ' - ' + s.nombresesion);
		if (s.nombreusuario == usuario && s.nombresesion == sesion) {
			//console.log('Coincide usuario y sesion');
			index = i;
		}
	});
	return index;
}

function buscaSesionPresentacion(usuario, presentacion) {
	var index = -1;
	sesiones.forEach(function (s, i) {
		//console.log(i + ' - ' + s.nombresesion);
		if (s.nombreusuario == usuario && s.presentacion == presentacion) {
			//console.log('Coincide usuario y sesion');
			index = i;
		}
	});
	return index;
}