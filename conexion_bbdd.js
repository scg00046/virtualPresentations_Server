const mysql = require('mysql');
/**
 * Estructura de la tabla de usuarios:
 * +------------+---------------+-----------+---------+------------+
 * |  idusuario | nombreusuario | password  | nombre  | apellidos  |
 * +------------+---------------+-----------+---------+------------+
 * 
 * Estructura tabla presentaciones:
 * +----------------+--------------+----------+----------------+
 * | idpresentacion | presentacion | paginas  | nombreusuario  |
 * +----------------+--------------+----------+----------------+
 */
// Conexión a la base de datos
//parámetros de la conexión
var con = mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "root",
    database: "presentacionvirtual"
});
con.connect(function (err) {
    if (err) {
        console.error("Error en la conexión a la Base de datos")
        throw err;
    }else { console.log("Conectado a la base de datos"); }

});

/**
 * Crear un nuevo usuario
 * @param {*} usuario 
 * @param {*} password 
 * @param {*} nombre 
 * @param {*} apellidos 
 */
function adduser(usuario, password, nombre, apellidos) {

    var sql = 'INSERT INTO usuarios (nombreusuario, password, nombre, apellidos) '
        + `VALUES ('${usuario}','${password}','${nombre}','${apellidos}');`;
    //console.log(sql);
    //añadir a la base de datos
    con.query(sql, function (err, result) {
        if (err) throw err;
        console.log("Se ha añadido el usuario, ID: " + result.insertId);
    });
}

/**
 * Busca un usuario a partir de su nombre de usuario
 * @param {String} usuario 
 */
function buscausuario(usuario) {

    return new Promise(function (resolve, reject) {
        var sql = `SELECT * FROM usuarios WHERE nombreusuario='${usuario}';`;
        con.query(sql, function (err, result, fields) {
            if (err) {
                reject(err);
            } else if (result == ''){
                reject('No se encuentra el usuario!');
            } else {
                var usuario = {
                    id: result[0].idusuario,
                    nombreusuario: result[0].nombreusuario,
                    password: result[0].password,
                    nombre: result[0].nombre,
                    apellidos: result[0].apellidos
                };
                resolve(usuario);
            }
        });
    });

}

/**
 * Comprueba el id y el nombre de usuario
 * @param {Number} id 
 * @param {String} usuario 
 */
function compruebaUsuario(id, usuario){
    return new Promise(function (resolve, reject) {
        var sql = `SELECT * FROM usuarios WHERE idusuario=${id} AND nombreusuario='${usuario}';`;
        con.query(sql, function (err, result, fields) {
            if (err) {
                reject(err);
            } else if (result == ''){
                reject('No se encuentra el usuario!');
            } else {
                resolve('OK');
            }
        });
    });
}
/**
 * Comprueba si el id y usuario es correcto y posteriormente si está registrada la presentación
 * Si no existe la presentación se resolverá con OK
 * En caso contrario 'reject' indicando que ya existe 
 * @param {number} id 
 * @param {String} usuario 
 * @param {String} presentacion 
 */
function compruebaUsuarioyPresentacion(id, usuario, presentacion){
    return new Promise(function (resolve, reject) {
        compruebaUsuario(id, usuario).then(resp=>{
            if(resp == 'OK'){
                var sql = `SELECT idpresentacion, presentacion, paginas, nombreusuario AS autor `
                +` FROM presentaciones WHERE nombreusuario='${usuario}' AND presentacion='${presentacion}';`;
                con.query(sql, function (err, result, fields) {
                    if (err) {
                        reject(err);
                    } else if (result == '') {
                        resolve('OK');
                    } else {
                        reject('La presentación ya existe');
                    }
                });
            }
        }).catch(e=>{
            reject(e);
        });
    });
}

/**
 * Busca las presentaciones disponibles en el servidor a partir del usuario
 * @param {String} usuario 
 */
function buscaPresentaciones(usuario){
    return new Promise(function (resolve, reject) {
        var sql = `SELECT * FROM presentaciones WHERE nombreusuario='${usuario}';`;
        con.query(sql, function (err, result, fields) {
            if (err) {
                reject(err);
            } else if (result == ''){
                reject('No se encuentra el usuario!');
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Registra en la base de datos la presentación subida al servidor
 * @param {String} presentacion nombre completo de la presentación
 * @param {*} paginas número de páginas
 * @param {String} usuario nombre de usuario
 */
function creaPresentacion (presentacion, paginas, usuario){
    return new Promise(function (resolve, reject) {
        var sql = `INSERT INTO presentaciones (presentacion,paginas,nombreusuario)`
        +` VALUES ('${presentacion}','${paginas}','${usuario}');`;
        con.query(sql, function (err, result, fields) {
            if (err) {
                console.log('pres bbdd:',err);
                reject('ERROR',err);
            } else {
                resolve('OK');
            }
        });
    });
}
/**
 * Elimina el registro de la presentación en la base de datos
 * @param {String} presentacion nombre completo de la presentación
 * @param {String} usuario nombre de usuario
 */
function borraPresentacion (presentacion, usuario){
    return new Promise(function (resolve, reject) {
        var sql = `DELETE FROM presentaciones WHERE`
            +` presentacion='${presentacion}' and nombreusuario='${usuario}';`;
        con.query(sql, function (err, result, fields) {
            if (err) {
                reject(err);
            } else {
                resolve('OK');
            }
        });
    });
}

//Declaración de las funciones
module.exports = {
    buscausuario: buscausuario,
    buscaPresentaciones: buscaPresentaciones,
    creaPresentacion: creaPresentacion,
    borraPresentacion: borraPresentacion,
    compruebaUsuario: compruebaUsuario,
    compruebaUsuarioyPresentacion: compruebaUsuarioyPresentacion
};